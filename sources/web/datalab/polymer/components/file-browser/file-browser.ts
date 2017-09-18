/*
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */

/// <reference path="../item-list/item-list.ts" />
/// <reference path="../input-dialog/input-dialog.ts" />
/// <reference path="../datalab-notification/datalab-notification.ts" />
/// <reference path="../../../../datalab/common.d.ts" />

/**
 * File listing element for Datalab.
 * Contains an item-list element to display files, a toolbar to interact with these files,
 * a progress bar that appears while loading the file list, and a navigation bar with
 * breadcrumbs.
 * Navigation is done locally to this element, and it does not modify the client's location.
 * This allows for navigation to be persistent if the view is changed away from the files
 * element.
 *
 * A mini version of this element can be rendered by specifying the "small" attribute, which
 * removes the toolbar and the refresh button, and uses the item-list element with no header
 * and no selection. It also doesn't do anything when a file is double clicked.
 * This is meant to be used for browsing only, such as the case for picking files or directories.
 */
class FileBrowserElement extends Polymer.Element implements DatalabPageElement {

  private static readonly _deleteListLimit = 10;

  /**
   * Promise that gets resolved when the element finished initialization.
   */
  public readyPromise: Promise<void>;

  /**
   * The fileId of currentFile
   */
  public currentFileId: DatalabFileId;

  /**
   * The list of files leading up to the current file
   */
  public currentPath: DatalabFile[];

  /**
   * The type of FileManager we want to use for this file-browser.
   */
  public fileManagerType: string;   // default is in code below

  /**
   * True makes the toolbar never visible.
   */
  public hideToolbar: boolean;

  /**
   * The currently selected file if exactly one is selected, or null if none is.
   */
  public selectedFile: DatalabFile | null;

  /*
   * Smaller version of this element to be used as a flyout file picker.
   */
  public small: boolean;

  /**
   * Number of leading breadcrumbs to trim.
   */
  public nLeadingBreadcrumbsToTrim: number;

  private _addToolbarCollapseThreshold = 900;
  private _apiManager: ApiManager;
  private _canPreview = false;
  private _dividerPosition: number;
  private _previewPaneCollapseThreshold = 600;
  private _fetching: boolean;
  private _fileList: DatalabFile[];
  private _fileListFetchPromise: Promise<any>;
  private _fileListRefreshInterval = 60 * 1000;
  private _fileListRefreshIntervalHandle = 0;
  private _fileManager: FileManager;
  private _isPreviewPaneToggledOn: boolean;
  private _updateToolbarCollapseThreshold = 720;
  private _uploadFileSizeWarningLimit = 25 * 1024 * 1024;

  static get is() { return 'file-browser'; }

  static get properties() {
    return {
      _canPreview: {
        type: Boolean,
        value: false,
      },
      _dividerPosition: {
        observer: '_dividerPositionChanged',
        type: Number,
        value: 70,
      },
      _fetching: {
        type: Boolean,
        value: false,
      },
      _fileList: {
        type: Array,
        value: () => [],
      },
      _isPreviewPaneEnabled: {
        computed: '_getPreviewPaneEnabled(small, _isPreviewPaneToggledOn)',
        type: Boolean,
      },
      _isPreviewPaneToggledOn: {
        type: Boolean,
        value: true,
      },
      _isToolbarHidden: {
        computed: '_computeIsToolbarHidden(small, hideToolbar)',
        type: Boolean,
      },
      currentFileId: {
        notify: true,
        observer: '_currentFileIdChanged',
        type: String,
      },
      currentPath: {
        observer: '_currentPathChanged',
        type: Object,
      },
      fileManagerType: {
        type: String,
        value: '',
      },
      hideToolbar: {
        type: Boolean,
        value: false,
      },
      nLeadingBreadcrumbsToTrim: {
        type: Number,
        value: 0,
      },
      selectedFile: {
        type: Object,
        value: null,
      },
      small: {
        type: Boolean,
        value: false,
      },
    };
  }

  /**
   * Called when the element's local DOM is ready and initialized.
   */
  async ready() {
    // Must set this to true before calling super.ready(), because the latter will cause
    // property updates that will cause _fetchFileList to be called first, we don't want
    // that. We want ready() to be the entry point so it gets the user's last saved path.
    this._fetching = true;

    super.ready();

    const filesElement = this.$.files as ItemListElement;
    filesElement.inlineDetailsMode = InlineDetailsDisplayMode.SINGLE_SELECT;

    this.$.breadCrumbs.addEventListener('crumbClicked', (e: ItemClickEvent) => {
      // Take the default root file into account, increment clicked index by one.
      // If there are any leading breadcrumbs we trimmed, add that number back.
      this.currentFileId = this.currentPath[e.detail.index + 1 + this.nLeadingBreadcrumbsToTrim].id;
    });
    this.$.breadCrumbs.addEventListener('rootClicked', () => {
      // If there are any leading breadcrumbs we trimmed, add that number back.
      this.currentFileId = this.currentPath[0 + this.nLeadingBreadcrumbsToTrim].id;
    });

    this._apiManager = ApiManagerFactory.getInstance();

    if (this.currentFileId) {
      this.fileManagerType = FileManagerFactory.fileManagerTypetoString(this.currentFileId.source);
    }

    if (!this.fileManagerType) {
      this.fileManagerType = this._getFileManagerTypeFromQueryParams();
    }

    // If no file manager type is specified in the element's attributes, try to
    // get it from the app settings. If it's not specified there either, default
    // to drive.
    if (!this.fileManagerType) {
      const appSettings = await SettingsManager.getAppSettingsAsync();
      if (appSettings.defaultFileManager) {
        this.fileManagerType = appSettings.defaultFileManager;
      } else {
        this.fileManagerType = 'drive';
      }
    }

    this._fileManager = FileManagerFactory.getInstanceForType(
        FileManagerFactory.fileManagerNameToType(this.fileManagerType));

    // TODO: Using a ready promise might be common enough a need that we should
    // consider adding it to a super class, maybe DatalabElement. For now, this
    // is the only element that needs it.
    if (!this.readyPromise) {
      this.readyPromise = this._loadStartupPath()
          .then(() => this._finishLoadingFiles());
    }

    return this.readyPromise.catch((e) => {
      Utils.showErrorDialog('Error loading file', e.message);
      this._fetching = false; // Stop looking busy
      throw e;
    });
  }

  _getFileManagerTypeFromQueryParams() {
    // Allow forcing a file manager type if not specified by file parameter.
    // TODO: Consider writing a config element instead of parsing URL parameters
    //       everywhere configs are needed.
    const queryParams = new URLSearchParams(window.location.search);
    if (queryParams.has('filemanager')) {
      const filemanagerParam = queryParams.get('filemanager');
      if (!this.fileManagerType && filemanagerParam) {
        return filemanagerParam;
      }
    }
    return '';
  }

  async _currentFileIdChanged() {
    if (!this.currentFileId) {
      return;
    }
    const newFileManagerType =
        FileManagerFactory.fileManagerTypetoString(this.currentFileId.source);
    if (newFileManagerType !== this.fileManagerType) {
      this.fileManagerType = newFileManagerType;
      this._fileManager = FileManagerFactory.getInstanceForType(
          FileManagerFactory.fileManagerNameToType(this.fileManagerType));
    }
    this.currentPath = await this._fileManager.fileIdToFullPath(this.currentFileId);
    this._fetchFileList();
  }

  disconnectedCallback() {
    // Clean up the refresh interval. This is important if multiple file-browser elements
    // are created and destroyed on the document.
    clearInterval(this._fileListRefreshIntervalHandle);
  }

  _computeIsToolbarHidden(small: boolean, hideToolbar: boolean) {
    return small || hideToolbar;
  }

  /**
   * Calls the FileManager to get the list of files at the current path, and
   * updates the _fileList property.
   * @param throwOnError whether to throw an exception if the refresh fails. This
   *                     is false by default because throwing is currently not used.
   */
  _fetchFileList(throwOnError = false): Promise<any> {
    // Don't overlap fetch requests. This can happen because we set up fetch from several sources:
    // - Initialization in the ready() event handler.
    // - Refresh mechanism called by the setInterval().
    // - User clicking refresh button.
    // - Files page gaining focus.
    if (this._fetching) {
      return this._fileListFetchPromise;
    }
    if (!this.currentFileId) {
      throw new Error('No current file to retrieve');
    }

    this._fetching = true;

    this._fileListFetchPromise = this._fileManager.list(this.currentFileId)
      .then((newList) => {
        // Only refresh the UI list if there are any changes. This helps keep
        // the item list's selections intact most of the time
        // TODO: [yebrahim] Try to diff the two lists and only inject the
        // differences in the DOM instead of refreshing the entire list if
        // one item changes. This is tricky because we don't have unique
        // ids for the items. Using paths might work for files, but is not
        // a clean solution.
        if (JSON.stringify(this._fileList) !== JSON.stringify(newList)) {
          this._fileList = newList;
          this._drawFileList();
        }
      })
      .catch((e: Error) => {
        if (throwOnError === true) {
          throw new Error('Error getting list of files: ' + e.message);
        } else {
          Utils.log.error('Error getting list of files:', e);
        }
      })
      .then(() => this._fetching = false);

    return this._fileListFetchPromise;
  }

  /**
   * Creates a new ItemListRow object for each entry in the file list, and sends
   * the created list to the item-list to render.
   */
  _drawFileList() {
    const createDetailsPaneFromFile = (file: DatalabFile) => {
      const detailsPane = document.createElement('inline-details-pane'
          ) as InlineDetailsPaneElement;
      detailsPane.file = file;
      return detailsPane;
    };
    (this.$.files as ItemListElement).rows = this._fileList.map((file) => {
      const createDetailsElement = file.getInlineDetailsName() ?
          () => createDetailsPaneFromFile(file) : undefined;
      const row = new ItemListRow({
          columns: [file.name, Utils.getFileStatusString(file.status || DatalabFileStatus.IDLE)],
          createDetailsElement,
          icon: file.icon,
      });
      return row;
    });
  }

  /**
   * Called when a double click event is dispatched by the item list element.
   * If the clicked item is a directory, pushes it onto the nav stack, otherwise
   * opens it in a new notebook or editor session.
   * If this element is in "small" mode, double clicking a file does not have
   * an effect, a directory will still navigate.
   */
  async _handleDoubleClicked(e: ItemClickEvent) {
    const clickedItem = this._fileList[e.detail.index];
    if (this.small && clickedItem.type !== DatalabFileType.DIRECTORY) {
      return;
    }
    if (clickedItem.type === DatalabFileType.DIRECTORY) {
      this.currentPath.push(clickedItem);
      this.currentFileId = clickedItem.id;
    } else if (clickedItem.type === DatalabFileType.NOTEBOOK) {
      const url = await this._fileManager.getNotebookUrl(clickedItem.id);
      window.open(url, '_blank');
    } else {
      const url = await this._fileManager.getEditorUrl(clickedItem.id);
      window.open(url, '_blank');
    }
  }

  /**
   * Called when the selection changes on the item list. If exactly one file
   * is selected, sets the selectedFile property to the selected file object.
   */
  _handleSelectionChanged() {
    const selectedIndices = (this.$.files as ItemListElement).selectedIndices;
    if (selectedIndices.length === 1) {
      this.selectedFile = this._fileList[selectedIndices[0]];
      this._canPreview = !!this.selectedFile.getPreviewName();
    } else {
      this.selectedFile = null;
      this._canPreview = false;
    }
  }

  /**
   * Goes back one step in history.
   */
  _navBackward() {
    window.history.back();
  }

  /**
   * Goes forward one step in history.
   */
  _navForward() {
    window.history.forward();
  }

  /**
   * Maintains the breadcrumbs when the path changes.
   */
  _currentPathChanged() {
    // Ignore the root file since that's shown by the crumbs element anyway,
    // also ignore any trimmed leading breadcrumbs. Slice up till the current
    // history index.
    const rootBreadcrumbs = 1 + this.nLeadingBreadcrumbsToTrim;
    this.$.breadCrumbs.crumbs = this.currentPath.map((p) => p.name).slice(rootBreadcrumbs);
  }

  _createNewNotebook() {
    return this._createNewItem(DatalabFileType.NOTEBOOK);
  }

  _createNewFile() {
    return this._createNewItem(DatalabFileType.FILE);
  }

  _createNewDirectory() {
    return this._createNewItem(DatalabFileType.DIRECTORY);
  }

  /**
   * This is the entry point for file upload functionality. This is here to avoid using
   * the very ugly <input> element for file uploads.
   */
  _altUpload() {
    this.$.altFileUpload.click();
  }

  /**
   * Gets called after the user selected one or more files from the upload modal.
   * For each of the selected files, reads its contents, converts it to base64, then
   * uses the FileManager to save it on the backend.
   */
  async _upload() {
    const inputElement = this.$.altFileUpload as HTMLInputElement;
    const files = [...inputElement.files as any];
    const uploadPromises: Array<Promise<any>> = [];

    // TODO: Check if the file already exists at the current path and provide a
    // consistent experience. Jupyter overwrites by default, but Drive stores
    // multiple files with the same name.

    // Find out if there's at least one large file.
    const hasLargeFile = files.some((file: File) =>
        file.size > this._uploadFileSizeWarningLimit);

    // If there's at least one large file, show a dialog to confirm the user
    // wants to continue with the upload.
    if (hasLargeFile) {
      let warningMsg = files.length > 1 ? 'Some of the files you selected are '
                                          : 'The file you selected is ';
      warningMsg += 'larger than 25MB. You might experience browser freeze or crash.';
      const dialogOptions: BaseDialogOptions = {
        messageHtml: warningMsg,
        okLabel: 'Upload Anyway',
        title: 'Warning: Large File',
      };

      const result: BaseDialogCloseResult =
        await Utils.showDialog(BaseDialogElement, dialogOptions);

      if (result.confirmed === false) {
        // Reset the input element.
        inputElement.value = '';
        return;
      }
    }

    files.forEach((file: File) => {

      // First, load the file data into memory.
      const readPromise = new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        // TODO: handle file reading errors.
        reader.onerror = () => {
          reject(new Error('Error reading file.'));
        };

        // TODO: this will freeze the UI on large files (>~20MB on my laptop) until
        // they're loaded into memory, and very large files (>~100MB) will crash
        // the browser.
        // One possible solution is to slice the file into small chunks and upload
        // each separately, but this requires the backend to support partial
        // chunk uploads. For Jupyter, this is supported in 5.0.0, see:
        // https://github.com/jupyter/notebook/pull/2162/files
        reader.readAsDataURL(file);
      });

      // Now upload the file data to the backend server.
      const uploadPromise = readPromise
        .then((itemData: string) => {
          // Extract the base64 data string
          itemData = itemData.substr(itemData.indexOf(',') + 1);

          return this._fileManager.create(DatalabFileType.FILE, this.currentFileId, file.name)
            .then((newFile: JupyterFile) => {
              newFile.format = 'base64';
              newFile.name = file.name;
              newFile.path = this.currentFileId.path;
              newFile.status = DatalabFileStatus.IDLE;
              return newFile;
            })
            .then((newFile) => this._fileManager.saveText(newFile, itemData))
            .catch((e) => {
              // Reset the input element on errors
              inputElement.value = '';
              throw e;
            });
        });
      uploadPromises.push(uploadPromise);
    });

    // Wait on all upload requests before declaring success or failure.
    try {
      await Promise.all(uploadPromises);
      if (uploadPromises.length) {
        // Dispatch a success notification, and refresh the file list
        const message = files.length > 1 ? files.length + ' files' : files[0].name;
        this.dispatchEvent(new NotificationEvent(message + ' uploaded successfully.'));

        this._fetchFileList();
      }
      // Reset the input element.
      inputElement.value = '';
    } catch (e) {
      Utils.showErrorDialog('Error uploading file', e.message);
    }
  }

  /**
   * The Jupyter contents API does not provide a way to create a new item with a specific
   * name, it only creates new untitled files or directories in provided path (see
   * https://github.com/jupyter/notebook/blob/master/notebook/services/contents/manager.py#L311).
   * In order to offer a better experience, we create an untitled item in the current path,
   * then rename it to whatever the user specified.
   *
   * This method creates an input modal to get the user input, then calls the ApiManager to
   * create a new notebook/directory at the current path, and fetches the updated list
   * of files to redraw.
   */
  _createNewItem(itemType: DatalabFileType) {

    // First, open a dialog to let the user specify a name for the notebook.
    const inputOptions: InputDialogOptions = {
      inputLabel: 'Name',
      okLabel: 'Create',
      title: 'New ' + Utils.getFileTypeString(itemType),
    };

    return Utils.showDialog(InputDialogElement, inputOptions)
      .then((closeResult: InputDialogCloseResult) => {
        // Only if the dialog has been confirmed with some user input, rename the
        // newly created file. Then if that is successful, reload the file list
        if (closeResult.confirmed && closeResult.userInput) {
          let newName = closeResult.userInput;
          // Make sure the name ends with .ipynb for notebooks for convenience
          if (itemType === DatalabFileType.NOTEBOOK && !newName.endsWith('.ipynb')) {
            newName += '.ipynb';
          }

          return this._fileManager.create(itemType, this.currentFileId, newName)
            .then(() => {
              // Dispatch a success notification, and refresh the file list
              this.dispatchEvent(new NotificationEvent('Created ' + newName + '.'));
              this._fetchFileList();
            })
            .catch((e: Error) => Utils.showErrorDialog('Error creating item', e.message));
        } else {
          return Promise.resolve(null);
        }
      });
  }

  /**
   * Opens the selected item in the text editor.
   */
  _openSelectedInEditor() {
    const filesElement = this.$.files as ItemListElement;
    const selectedIndices = filesElement.selectedIndices;
    if (selectedIndices.length === 1) {
      const i = selectedIndices[0];
      const selectedObject = this._fileList[i];

      this._fileManager.getEditorUrl(selectedObject.id)
        .then((url) => window.open(url, '_blank'));
    }
  }

  /**
   * Creates an input modal to get the user input, then calls the ApiManager to
   * rename the currently selected item. This only works if exactly one item is
   * selected.
   */
  _renameSelectedItem() {

    const selectedIndices = (this.$.files as ItemListElement).selectedIndices;
    if (selectedIndices.length === 1) {
      const i = selectedIndices[0];
      const selectedObject = this._fileList[i];

      // Open a dialog to let the user specify the new name for the selected item.
      const inputOptions: InputDialogOptions = {
        inputLabel: 'New name',
        inputValue: selectedObject.name,
        okLabel: 'Rename',
        title: 'Rename ' + selectedObject.type.toString(),
      };

      // Only if the dialog has been confirmed with some user input, rename the
      // selected item. Then if that is successful, and reload the file list.
      return Utils.showDialog(InputDialogElement, inputOptions)
        .then((closeResult: InputDialogCloseResult) => {
          if (closeResult.confirmed && closeResult.userInput) {
            return this._fileManager.rename(selectedObject.id, closeResult.userInput)
              .then(() => {
                // Dispatch a success notification, and refresh the file list
                const message = 'Renamed ' + selectedObject.name +
                    ' to ' + closeResult.userInput + '.';
                this.dispatchEvent(new NotificationEvent(message));
                this._fetchFileList();
              })
              .catch((e: Error) => Utils.showErrorDialog('Error renaming item', e.message));
          } else {
            return Promise.resolve(null);
          }
        });
    } else {
      return Promise.resolve(null);
    }
  }

  /**
   * Creates a modal to get the user's confirmation with a list of the items
   * to be deleted, then calls the ApiManager for each of these items to delete,
   * then refreshes the file list.
   */
  _deleteSelectedItems() {

    const selectedIndices = (this.$.files as ItemListElement).selectedIndices;
    if (selectedIndices.length) {
      // Build friendly title and body messages that adapt to the number of items.
      const num = selectedIndices.length;
      let title = 'Delete ';

      // Title
      if (num === 1) {
        const i = selectedIndices[0];
        const selectedObject = this._fileList[i];
        title += selectedObject.type.toString();
      } else {
        title += num + ' items';
      }

      // Body
      let itemList = '<ul>\n';
      selectedIndices.forEach((fileIdx: number, i: number) => {
        if (i < FileBrowserElement._deleteListLimit) {
          itemList += '<li>' + this._fileList[fileIdx].name + '</li>\n';
        }
      });
      if (num > FileBrowserElement._deleteListLimit) {
        itemList += '+ ' + (num - FileBrowserElement._deleteListLimit) + ' more.';
      }
      itemList += '</ul>';
      const messageHtml = '<div>Are you sure you want to delete:</div>' + itemList;

      // Open a dialog to let the user confirm deleting the list of selected items.
      const inputOptions: BaseDialogOptions = {
        messageHtml,
        okLabel: 'Delete',
        title,
      };

      // Only if the dialog has been confirmed, call the ApiManager to delete each
      // of the selected items, and wait for all promises to finish. Then if that
      // is successful, reload the file list.
      return Utils.showDialog(BaseDialogElement, inputOptions)
        .then((closeResult: BaseDialogCloseResult) => {
          if (closeResult.confirmed) {
            const deletePromises = selectedIndices.map((i: number) => {
              return this._fileManager.delete(this._fileList[i].id);
            });
            // TODO: [yebrahim] If at least one delete fails, _fetchFileList will never be called,
            // even if some other deletes completed.
            return Promise.all(deletePromises)
              .then(() => {
                // Dispatch a success notification, and refresh the file list
                const message = 'Deleted ' + num + (num === 1 ? ' file.' : 'files.');
                this.dispatchEvent(new NotificationEvent(message));
                this._fetchFileList();
              })
              .catch((e: Error) => Utils.showErrorDialog('Error deleting item', e.message));
          } else {
            return Promise.resolve(null);
          }
        });
    } else {
      return Promise.resolve(null);
    }
  }

  /**
   * Gets called when the divider position changes, to update ToggledOn
   * if the user moves the position to or from 100%.
   */
  _dividerPositionChanged() {
    if (this._dividerPosition === 100 && this._isPreviewPaneToggledOn) {
      this._isPreviewPaneToggledOn = false;
    } else if (this._dividerPosition < 100 && !this._isPreviewPaneToggledOn) {
      this._isPreviewPaneToggledOn = true;
    }
  }

  /**
   * Computes whether the preview pane should be enabled. This depends on two values:
   * whether the element has the small attribute, and whether the user has switched it
   * off manually.
   */
  _getPreviewPaneEnabled(small: boolean, toggledOn: boolean) {
    return !small && toggledOn;
  }

  /**
   * Switches preview pane on or off.
   */
  _togglePreviewPane() {
    this._isPreviewPaneToggledOn = !this._isPreviewPaneToggledOn;
  }

  /**
   * Creates a directory picker modal to get the user to choose a destination for the
   * selected item, sends a copy item API call, then refreshes the file list. This only
   * works if exactly one item is selected.
   * TODO: Consider allowing multiple items to be copied.
   */
  _copySelectedItem() {

    const selectedIndices = (this.$.files as ItemListElement).selectedIndices;

    if (selectedIndices.length === 1) {
      const i = selectedIndices[0];
      const selectedObject = this._fileList[i];

      const options: DirectoryPickerDialogOptions = {
        big: true,
        okLabel: 'Copy Here',
        title: 'Copy Item',
        withFileName: false,
      };
      return Utils.showDialog(DirectoryPickerDialogElement, options)
        .then((closeResult: DirectoryPickerDialogCloseResult) => {
          if (closeResult.confirmed) {
            return this._fileManager.copy(selectedObject.id, closeResult.selectedDirectory.id)
              .then(() => {
                // Dispatch a success notification, and refresh the file list
                const message = 'Copied item.';
                this.dispatchEvent(new NotificationEvent(message));
                this._fetchFileList();
              })
              .catch((e: Error) => Utils.showErrorDialog('Error copying item', e.message));
          } else {
            return Promise.resolve(null);
          }
        });
    } else {
      return Promise.resolve(null);
    }
  }

  /**
   * Creates a directory picker modal to get the user to choose a destination for the
   * selected item, sends a rename item API call, then refreshes the file list. This only
   * works if exactly one item is selected.
   * TODO: Consider allowing multiple items to be moved.
   */
  _moveSelectedItem() {

    const selectedIndices = (this.$.files as ItemListElement).selectedIndices;

    if (selectedIndices.length === 1) {
      const i = selectedIndices[0];
      const selectedObject = this._fileList[i];

      const options: DirectoryPickerDialogOptions = {
        big: true,
        okLabel: 'Move Here',
        title: 'Move Item',
        withFileName: false,
      };
      return Utils.showDialog(DirectoryPickerDialogElement, options)
        .then((closeResult: DirectoryPickerDialogCloseResult) => {
          if (closeResult.confirmed) {
            // Moving is renaming.
            return this._fileManager.rename(selectedObject.id, selectedObject.name,
                                            closeResult.selectedDirectory.id)
              .then(() => {
                // Dispatch a success notification, and refresh the file list
                const message = 'Moved item.';
                this.dispatchEvent(new NotificationEvent(message));
                this._fetchFileList();
              })
              .catch((e: Error) => Utils.showErrorDialog('Error moving item', e.message));
          } else {
            return Promise.resolve(null);
          }
        });
    } else {
      return Promise.resolve(null);
    }
  }

  _toggleAltAddToolbar() {
    this.$.altAddToolbar.toggle();
  }

  _toggleAltUpdateToolbar() {
    this.$.altUpdateToolbar.toggle();
  }

  /**
   * Called on window.resize, collapses elements to keep the element usable
   * on small screens.
   */
  resizeHandler() {
    const width = this.$.toolbar.clientWidth;
    // Collapse the add buttons on the toolbar
    if (width < this._addToolbarCollapseThreshold) {
      Utils.moveElementChildren(this.$.addToolbar, this.$.altAddToolbar);
      this.$.altAddToolbarToggle.style.display = 'inline-flex';
    } else {
      Utils.moveElementChildren(this.$.altAddToolbar, this.$.addToolbar);
      this.$.altAddToolbarToggle.style.display = 'none';
      this.$.altAddToolbar.close();
    }

    // Collapse the update buttons on the toolbar
    if (width < this._updateToolbarCollapseThreshold) {
      Utils.moveElementChildren(this.$.updateToolbar, this.$.altUpdateToolbar);
      this.$.altUpdateToolbarToggle.style.display = 'inline-flex';
    } else {
      Utils.moveElementChildren(this.$.altUpdateToolbar, this.$.updateToolbar);
      this.$.altUpdateToolbarToggle.style.display = 'none';
      this.$.altUpdateToolbar.close();
    }

    // Collapse the preview pane
    if (width < this._previewPaneCollapseThreshold) {
      this._isPreviewPaneToggledOn = false;
    }

    (this.$.breadCrumbs as BreadCrumbsElement).resizeHandler();
    (this.$.filesContainer as ResizableDividerElement).resizeHandler();
  }

  /**
   * Starts auto refreshing the file list, and also triggers an immediate refresh.
   */
  focusHandler() {
    // Refresh the file list periodically as long as the document is focused.
    // Note that we don't rely solely on the interval to keep the list in sync,
    // the refresh also happens after file operations, and when the files page
    // gains focus.
    if (!this._fileListRefreshIntervalHandle) {
      this._fileListRefreshIntervalHandle = setInterval(() => {
        if (document.hasFocus()) {
          this._fetchFileList();
        }
      }, this._fileListRefreshInterval);
    }
    // Refresh the list
    this._fetchFileList();
  }

  /**
   * Stops the auto refresh of the file list. This happens when the user moves
   * away from the page.
   */
  blurHandler() {
    if (this._fileListRefreshIntervalHandle) {
      clearInterval(this._fileListRefreshIntervalHandle);
      this._fileListRefreshIntervalHandle = 0;
    }
  }

  private async _loadStartupPath() {
    if (this.fileManagerType === 'jupyter') {
      // TODO - make SettingsManager able to store startuppaths
      // for multiple file managers.
      const settings = await SettingsManager.getUserSettingsAsync(true /*forceRefresh*/);
      let startuppath = settings.startuppath;
      if (startuppath) {
        // For backward compatibility with the current path format.
        if (startuppath.startsWith('/tree/')) {
          startuppath = startuppath.substr('/tree/'.length);
        }
        this.currentFileId = new DatalabFileId(startuppath, FileManagerType.JUPYTER);
      }
    } else if (!this.currentFileId) {
      const root = await this._fileManager.getRootFile();
      this.currentFileId = root.id;
    }
  }

  private _finishLoadingFiles() {
    this.resizeHandler();
    this.focusHandler();

    const filesElement = this.shadowRoot.querySelector('#files');
    if (filesElement) {
      filesElement.addEventListener('itemDoubleClick',
                                    this._handleDoubleClicked.bind(this));
      filesElement.addEventListener('selected-indices-changed',
                                    this._handleSelectionChanged.bind(this));
    }

    // For a small file/directory picker, we don't need to show the status.
    (this.$.files as ItemListElement).columns = this.small ? ['Name'] : ['Name', 'Status'];

    this._fetching = false;
    return this._fetchFileList();
  }

}

customElements.define(FileBrowserElement.is, FileBrowserElement);
