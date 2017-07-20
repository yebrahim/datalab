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

/// <reference path="../datalab-files/datalab-files.ts" />

/**
 * Dialog close context, includes whether the dialog was confirmed, and the user selected
 * directory path.
 */
interface DirectoryPickerDialogCloseResult extends InputDialogCloseResult {
  directoryPath: string,
}

/**
 * Directory Picker Dialog element for Datalab, extends the Input dialog element.
 * This element is a modal dialog that presents the user with a file picker that can navigate
 * into directories to select destination path of copying or moving an item. It uses a minimal
 * version of the datalab-files element, which shows the file picker without the toolbar, and
 * without the ability to select files.
 * The dialog returns the user selected directory path, if any.
 */
class DirectoryPickerDialogElement extends InputDialogElement {

  private static _directoryPickerTemplate: PolymerTemplate;

  static get is() { return "directory-picker-dialog"; }

  /**
   * This template is calculated once in run time based on the template of  the
   * super class, then saved in a local variable for memoization.
   * See https://www.polymer-project.org/2.0/docs/devguide/dom-template#inherited-templates
   */
  static get template() {
    if (!this._directoryPickerTemplate) {
      this._directoryPickerTemplate = Utils.stampInBaseTemplate(this.is, InputDialogElement.template);
    }
    return this._directoryPickerTemplate;
  }

  /**
   * Also send back the user selected path in the closing context.
   */
  getCloseResult() {
    return {
      ...super.getCloseResult(),
      directoryPath: this.$.filePicker.currentPath,
    };
  }

}

customElements.define(DirectoryPickerDialogElement.is, DirectoryPickerDialogElement);
