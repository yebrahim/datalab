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
 * Dependency custom element for ApiManager
 */
const FILE_MANAGER_ELEMENT = {
  bigquery: {
    name: 'bigquery',
    path: 'modules/bigquery-file-manager/bigquery-file-manager.html',
    type: BigQueryFileManager,
  },
  drive: {
    name: 'drive',
    path: 'modules/drive-file-manager/drive-file-manager.html',
    type: DriveFileManager,
  },
  github: {
    name: 'github',
    path: 'modules/github-file-manager/github-file-manager.html',
    type: GithubFileManager,
  },
  jupyter: {
    name: 'jupyter',
    path: 'modules/jupyter-file-manager/jupyter-file-manager.html',
    type: JupyterFileManager,
  },
};

enum FileManagerType {
  BIG_QUERY,
  DRIVE,
  GITHUB,
  JUPYTER,
}

/**
 * Maintains and gets the static FileManager singleton.
 */
// TODO: Find a better way to switch the FileManager instance based on the
// environment
class FileManagerFactory {

  private static _fileManagers: { [fileManagerType: string]: FileManager } = {};

  /** Get the default FileManager. */
  public static getInstance() {
    return FileManagerFactory.getInstanceForType(FileManagerType.JUPYTER);
  }

  public static fileManagerNameToType(name: string): FileManagerType {
    switch (name) {
      case 'bigquery': return FileManagerType.BIG_QUERY;
      case 'drive': return FileManagerType.DRIVE;
      case 'github': return FileManagerType.GITHUB;
      case 'jupyter': return FileManagerType.JUPYTER;
      default: throw new Error('Unknown FileManagerType name ' + name);
    }
  }

  // Consider moving this to a strings module
  public static fileManagerTypetoString(type: FileManagerType) {
    switch (type) {
      case FileManagerType.BIG_QUERY: return 'bigquery';
      case FileManagerType.DRIVE: return 'drive';
      case FileManagerType.GITHUB: return 'github';
      case FileManagerType.JUPYTER: return 'jupyter';
      default: throw new Error('Unknown FileManager type: ' + type);
    }
  }

  public static getInstanceForType(fileManagerType: FileManagerType) {
    const backendType = FileManagerFactory._getBackendType(fileManagerType);
    if (!FileManagerFactory._fileManagers[backendType.name]) {

      FileManagerFactory._fileManagers[fileManagerType] = new backendType.type();
    }

    return FileManagerFactory._fileManagers[fileManagerType];
  }

  private static _getBackendType(fileManagerType: FileManagerType) {
    switch (fileManagerType) {
      case FileManagerType.BIG_QUERY: return FILE_MANAGER_ELEMENT.bigquery;
      case FileManagerType.DRIVE: return FILE_MANAGER_ELEMENT.drive;
      case FileManagerType.GITHUB: return FILE_MANAGER_ELEMENT.github;
      case FileManagerType.JUPYTER: return FILE_MANAGER_ELEMENT.jupyter;
      default: throw new Error('Unknown FileManagerType');
    }
  }
}

/**
 * Unique identifier for a file object.
 */
class DatalabFileId {
  private static _delim = ':';

  path: string;
  source: FileManagerType;

  constructor(path: string, source: FileManagerType) {
    this.path = path;
    this.source = source;
  }

  public static fromQueryString(querystring: string) {
    const tokens = querystring.split(DatalabFileId._delim);
    if (tokens.length !== 2) {
      throw new Error('Invalid format for file id: ' + querystring);
    }
    return new DatalabFileId(tokens[1], FileManagerFactory.fileManagerNameToType(tokens[0]));
  }

  public toQueryString() {
    return FileManagerFactory.fileManagerTypetoString(this.source) + DatalabFileId._delim +
        this.path;
  }

}
