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
 * This file manager connects to api.github.com and uses the github REST API
 * as documented at developer.github.com/v3.
 */

// TODO(jimmc): Need to deal with the following
// paged results (default page size is 30, can request up to 100)
// error conditions
// rate limiting (default is 60 per hour)
// size and dates for display in file browser (once it can do that)

class GithubFile extends DatalabFile {}

interface GhRepoResponse {
  id: string;
  name: string;   // just the repo name
  full_name: string;  // user/repo
  description: string;
  // There are a ton of other fields, including a bunch of URLs,
  // creation time, forks, watchers, etc.
}

interface GhDirEntryResponse {
  name: string; // filename only
  path: string; // relative to the repo base
  sha: string;
  size: number; // size of file in bytes
  type: string; // 'file' or 'dir'
  url: string;  // the url to access this file via the api
  // There are a bunch of other fields, mostly URLs
}

interface GhFileResponse {
  type: string;
  size: number;
  name: string;
  path: string;
  encoding: string;
  content: string;
  url: string;  // the url to access this file via the api
}

/**
 * A file manager that wraps the Github API so that we can browse github
 * repositories.
 */
class GithubFileManager implements FileManager {

  private _githubApiManager: GithubApiManager;

  public get(fileId: DatalabFileId): Promise<DatalabFile> {
    if (fileId.path === '' || fileId.path === '/') {
      return Promise.resolve(this._ghRootDatalabFile());
    }
    const githubPath = this._githubPathForFileId(fileId, 'get');
    return this._githubApiPathRequest(githubPath)
        .then((response: GhFileResponse) => {
          return this._ghFileToDatalabFile(response);
        });
  }

  public getStringContent(fileId: DatalabFileId, _asText?: boolean):
      Promise<string> {
    const githubPath = this._githubPathForFileId(fileId, 'getStringContent');
    return this._githubApiPathRequest(githubPath)
        .then((response: GhFileResponse) => {
          return this._ghFileToContentString(response);
        });
  }

  public async getRootFile() {
    return this.get(new DatalabFileId('/', FileManagerType.GITHUB));
  }

  public saveText(_file: DatalabFile, _content: string): Promise<DatalabFile> {
    throw new UnsupportedMethod('saveText', this);
  }

  public list(fileId: DatalabFileId): Promise<DatalabFile[]> {
    const pathParts = fileId.path.split('/').filter((part) => !!part);
    if (pathParts.length === 0) {
      // No org/user specified. This would mean we should list all of them,
      // but we know that's too many, so we return an empty list.
      // TODO(jimmc): After fixing file-browser to handle throwing an error
      // here, do that instead.
      return Promise.resolve([]);
    } else if (pathParts.length === 1) {
      // Only the username or org was specified, list their repos
      const githubPath = '/users/' + pathParts[0] + '/repos';
      return this._githubApiPathRequest(githubPath)
          .then((response: GhRepoResponse[]) => {
            return this._ghReposResponseToDatalabFiles(response);
          });
    } else {
      // If at least two path components were specified, then we have
      // a username and a project. Everything after that, if specified,
      // are folders or files under that.
      const githubPath = '/repos/' + pathParts.slice(0, 2).join('/') +
        '/contents/' + pathParts.slice(2).join('/');
      return this._githubApiPathRequest(githubPath)
          .then((response: GhDirEntryResponse[]) => {
            return this._ghDirEntriesResponseToDatalabFiles(response);
          });
    }
  }

  public create(_fileType: DatalabFileType, _containerId: DatalabFileId, _name: string):
      Promise<DatalabFile> {
    throw new UnsupportedMethod('create', this);
  }

  public rename(_oldFileId: DatalabFileId, _name: string, _newContainerId?: DatalabFileId):
      Promise<DatalabFile> {
    throw new UnsupportedMethod('rename', this);
  }

  public delete(_fileId: DatalabFileId): Promise<boolean> {
    throw new UnsupportedMethod('delete', this);
  }

  public copy(_fileId: DatalabFileId, _destinationDirectoryId: DatalabFileId): Promise<DatalabFile> {
    throw new UnsupportedMethod('copy', this);
  }

  public async getEditorUrl(fileId: DatalabFileId) {
    return Utils.getHostRoot() + '/editor?file=' + fileId.toQueryString();
  }

  public async getNotebookUrl(fileId: DatalabFileId): Promise<string> {
    return location.protocol + '//' + location.host +
        '/notebook?file=' + fileId.toQueryString();
  }

  public async fileIdToFullPath(fileId: DatalabFileId): Promise<DatalabFile[]> {
    const tokens = fileId.path.split('/').filter((p) => !!p);
    const fullPath = tokens.map((_, i) =>
        this.get(new DatalabFileId(tokens.slice(0, i + 1).join('/'), FileManagerType.JUPYTER)));
    fullPath.unshift(this.getRootFile());
    return Promise.all(fullPath);
  }

  private _githubPathForFileId(fileId: DatalabFileId, op: string): string {
    const pathParts = fileId.path.split('/').filter((part) => !!part);
    if (pathParts.length === 0) {
      throw new Error(op + ' on github root is not allowed');
    } else if (pathParts.length === 1) {
      throw new Error(op + ' on a github user is not allowed');
    }
    const githubPath = '/repos/' + pathParts.slice(0, 2).join('/') +
        '/contents/' + pathParts.slice(2).join('/');
    return githubPath;
  }

  private _githubApiPathRequest(githubPath: string): Promise<any> {
    const githubBaseUrl = 'https://api.github.com';
    const restUrl = githubBaseUrl + githubPath;
    const options: XhrOptions = {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        // The github docs request that we set User-Agent so they can tell
        // what code is sending the API request, but Chrome doesn't let us
        // do that, and the list of Access-Control-Allow-Headers from
        // the preflight to api.github.com pretty much means the only
        // header we can use for this is X-Requested-With.
        'X-Requested-With': 'XMLHttpRequest; googledatalab-datalab-app',
      },
    };
    return this._getGithubApiManager().sendRequestAsync(restUrl, options, false);
  }

  private _getGithubApiManager(): GithubApiManager {
    if (!this._githubApiManager) {
      this._githubApiManager = new GithubApiManager();
    }
    return this._githubApiManager;
  }

  private _ghRootDatalabFile(): DatalabFile {
    const path = '/';
    const file = new GithubFile();
    file.id = new DatalabFileId(path, FileManagerType.GITHUB);
    file.name = '/';
    file.type = DatalabFileType.DIRECTORY;
    return file;
  }

  private _ghReposResponseToDatalabFiles(response: GhRepoResponse[]):
      DatalabFile[] {
    return response.map((repo) => this._ghRepoToDatalabFile(repo));
  }

  private _ghDirEntriesResponseToDatalabFiles(response: GhDirEntryResponse[]):
      DatalabFile[] {
    return response.filter((file) =>
      file.name.endsWith('.ipynb') ||
      file.name.endsWith('.txt') ||
      file.type === 'dir'
    )
    .map((file) => this._ghDirEntryToDatalabFile(file));
  }

  private _ghRepoToDatalabFile(repo: GhRepoResponse): DatalabFile {
    const type = DatalabFileType.DIRECTORY;
    const icon = Utils.getItemIconString(type);
    const file = new GithubFile();
    file.id = new DatalabFileId(repo.full_name, FileManagerType.GITHUB),
    file.icon = icon;
    file.name = repo.name,
    file.type = type;
    return file;
  }

  private _ghDirEntryToDatalabFile(file: GhDirEntryResponse): DatalabFile {
    const type =
        file.name.endsWith('.ipynb') ? DatalabFileType.NOTEBOOK :
        file.type === 'dir' ? DatalabFileType.DIRECTORY :
        DatalabFileType.FILE;
    const icon = Utils.getItemIconString(type);
    const pathParts = file.url.split('/');
    const prefix = pathParts.slice(4, 6).join('/'); // user and project
    const path = prefix + '/' + file.path;
    const githubFile = new GithubFile();
    githubFile.id = new DatalabFileId(path, FileManagerType.GITHUB);
    githubFile.icon = icon;
    githubFile.name = file.name;
    githubFile.type = type;
    return githubFile;
  }

  private _ghFileToDatalabFile(file: GhFileResponse): DatalabFile {
    const type = file.type === 'dir' ?
        DatalabFileType.DIRECTORY : DatalabFileType.FILE;
    const icon = Utils.getItemIconString(type);
    const pathParts = file.url.split('/');
    const prefix = pathParts.slice(4, 6).join('/'); // user and project
    const path = prefix + '/' + file.path;
    const githubFile = new GithubFile();
    githubFile.icon = icon;
    githubFile.id = new DatalabFileId(path, FileManagerType.GITHUB);
    githubFile.name = file.name;
    githubFile.status = DatalabFileStatus.IDLE;
    githubFile.type = type;
    return githubFile;
  }

  private _ghFileToContentString(file: GhFileResponse): string {
    if (file.encoding !== 'base64') {
      throw new Error('github file encoding "' + file.encoding +
        '" is not supported');
    }
    return atob(file.content);
  }
}

// TODO(jimmc): See if we can drop this class as part of moving
// back towards having just one ApiManager.
// We just want the sendRequestAsync method of BaseApimanager.
class GithubApiManager extends BaseApiManager {
  // We don't care about this method, but it is abstract in the base class.
  getBasePath() {
    return Promise.resolve('');
  }
}
