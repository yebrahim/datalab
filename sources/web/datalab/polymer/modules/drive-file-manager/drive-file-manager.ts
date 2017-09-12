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

/**
 * This file contains a collection of functions that call the Google Drive APIs, and are
 * wrapped in the ApiManager class.
 */

class DriveFile extends DatalabFile {
  parents: string[];
}

/**
 * An Google Drive specific file manager.
 */
class DriveFileManager implements FileManager {

  private static readonly _directoryMimeType = 'application/vnd.google-apps.folder';
  private static readonly _notebookMimeType = 'application/json';

  private static _upstreamToDriveFile(file: gapi.client.drive.File) {
    const datalabFile: DriveFile = new DriveFile();
    datalabFile.icon = file.iconLink;
    datalabFile.id = new DatalabFileId(file.id, FileManagerType.DRIVE);
    datalabFile.name = file.name;
    datalabFile.parents = file.parents;
    datalabFile.status = DatalabFileStatus.IDLE;
    datalabFile.type = file.mimeType === DriveFileManager._directoryMimeType ?
                                         DatalabFileType.DIRECTORY :
                                         DatalabFileType.FILE;
    if (datalabFile.name.endsWith('.ipynb')) {
      datalabFile.type = DatalabFileType.NOTEBOOK;
    }
    return datalabFile;
  }
  public async get(fileId: DatalabFileId): Promise<DatalabFile> {
    const fields = [
      'id',
      'kind',
      'mimeType',
      'name',
      'parents',
    ];
    const upstreamFile = await GapiManager.drive.getFile(fileId.path, fields);
    return DriveFileManager._upstreamToDriveFile(upstreamFile);
  }

  public async getStringContent(fileId: DatalabFileId, _asText?: boolean): Promise<string> {
    const [, content] = await GapiManager.drive.getFileWithContent(fileId.path);
    if (content === null) {
      throw new Error('Could not download file: ' + fileId.toQueryString());
    }
    return content;
  }

  public async getRootFile(): Promise<DatalabFile> {
    const upstreamFile = await GapiManager.drive.getRoot();
    return DriveFileManager._upstreamToDriveFile(upstreamFile);
  }

  public saveText(file: DatalabFile, text: string): Promise<DatalabFile> {
    return GapiManager.drive.patchContent(file.id.path, text)
      .then((upstreamFile) => DriveFileManager._upstreamToDriveFile(upstreamFile));
  }

  public async list(fileId: DatalabFileId): Promise<DatalabFile[]> {
    const whitelistFilePredicates = [
      'name contains \'.ipynb\'',
      'name contains \'.txt\'',
      'mimeType = \'' + DriveFileManager._directoryMimeType + '\'',
    ];
    const queryPredicates = [
      '"' + fileId.path + '" in parents',
      'trashed = false',
      '(' + whitelistFilePredicates.join(' or ') + ')',
    ];
    const fileFields = [
      'createdTime',
      'iconLink',
      'id',
      'mimeType',
      'modifiedTime',
      'name',
      'parents',
    ];
    const orderModifiers = [
      'folder',
      'modifiedTime desc',
      'name',
    ];

    // TODO: Put this code in a common place, instead of doing this for every
    // file manager. Perhaps a base file manager should get the list of files
    // and sessions and build the resulting DatalabFile list.
    const [upstreamFiles, sessions] = await Promise.all([
      GapiManager.drive.listFiles(fileFields, queryPredicates, orderModifiers),
      SessionManager.listSessionPaths()
        .catch((e) => {
          Utils.log.error('Could not load sessions: ' + e.message);
          return [];
        }),
    ]);
    // Combine the return values of the two requests to supplement the files
    // array with the status value.
    return upstreamFiles.map((file) => {
      const driveFile = DriveFileManager._upstreamToDriveFile(file);
      driveFile.status = (sessions as string[]).indexOf(driveFile.id.path) > -1 ?
          DatalabFileStatus.RUNNING : DatalabFileStatus.IDLE;
      return driveFile;
    });
  }

  public async create(fileType: DatalabFileType, containerId?: DatalabFileId, name?: string)
      : Promise<DatalabFile> {
    let mimeType: string;
    switch (fileType) {
      case DatalabFileType.DIRECTORY:
        mimeType = DriveFileManager._directoryMimeType; break;
      case DatalabFileType.NOTEBOOK:
        mimeType = DriveFileManager._notebookMimeType; break;
      default:
        mimeType = 'text/plain';
    }
    const content = fileType === DatalabFileType.NOTEBOOK ?
        NotebookContent.EMPTY_NOTEBOOK_CONTENT : '';
    const upstreamFile = await GapiManager.drive.create(mimeType,
                                                        containerId ? containerId.path : 'root',
                                                        name || 'New Item',
                                                        content);
    return DriveFileManager._upstreamToDriveFile(upstreamFile);
  }

  public rename(oldFileId: DatalabFileId, newName: string, newContainerId?: DatalabFileId)
      : Promise<DatalabFile> {
    const newContainerPath = newContainerId ? newContainerId.path : undefined;
    return GapiManager.drive.renameFile(oldFileId.path, newName, newContainerPath)
      .then((upstreamFile) => DriveFileManager._upstreamToDriveFile(upstreamFile));
  }

  public delete(fileId: DatalabFileId): Promise<boolean> {
    return GapiManager.drive.deleteFile(fileId.path)
      .then(() => true, () => false);
  }

  public copy(file: DatalabFileId, destinationDirectoryId: DatalabFileId): Promise<DatalabFile> {
    return GapiManager.drive.copy(file.path, destinationDirectoryId.path)
      .then((upstreamFile) => DriveFileManager._upstreamToDriveFile(upstreamFile));
  }

  public async getEditorUrl(fileId: DatalabFileId) {
    return Utils.getHostRoot() + '/editor?file=' + fileId.toQueryString();
  }

  public async getNotebookUrl(fileId: DatalabFileId): Promise<string> {
    return location.protocol + '//' + location.host +
        '/notebook?file=' + fileId.toQueryString();
  }

  public async fileIdToFullPath(fileId: DatalabFileId): Promise<DatalabFile[]> {
    // TODO - create the real path to this object, or figure out
    // a better way to handle not having the full path in the breadcrumbs
    let file = await this.get(fileId) as DriveFile;
    const fullPath = [file];
    while (file.parents) {
      file = await this.get(
          new DatalabFileId(file.parents[0], FileManagerType.DRIVE)) as DriveFile;
      fullPath.unshift(file);
    }
    return fullPath;
  }
}
