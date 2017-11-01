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

class MockFile extends DatalabFile {
  constructor(name = '', path = '') {
    super({
      getInlineDetailsName: () => '',
      getPreviewName: () => '',
      icon: '',
      id: new DatalabFileId(path, FileManagerType.MOCK),
      name,
      type: DatalabFileType.DIRECTORY,
    });
  }
}

class MockFileManager extends BaseFileManager {
  public async getRootFile() {
    return new MockFile('', '/');
  }
  public pathToPathHistory(_: string): DatalabFile[] {
    return [
      new MockFile('mock', 'mock'),
      new MockFile('file', 'file'),
      new MockFile('path', 'path'),
    ];
  }
}

describe('<file-browser>', () => {
  let testFixture: FileBrowserElement;

  const mockFiles = [
    new MockFile('file1'),
    new MockFile('file2'),
    new MockFile('file3'),
  ];
  const fileManagerSetting = 'mock';

  before(() => {
    SettingsManager.getAppSettingsAsync = () => {
      const mockSettings: common.AppSettings = {
        defaultFileManager: fileManagerSetting,
      };
      return Promise.resolve(mockSettings);
    };
    ApiManager.getBasePath = () => {
      return Promise.resolve('');
    };
    SessionManager.listSessionsAsync = () => {
      return Promise.resolve([]);
    };
    const mockFileManager = new MockFileManager();
    mockFileManager.list = () => {
      return Promise.resolve(mockFiles);
    };
    FileManagerFactory.getInstance = () => mockFileManager;
    FileManagerFactory.getInstanceForType = (_) => mockFileManager;
    FileManagerFactory.fileManagerNameToType = (_) => FileManagerType.MOCK;
    FileManagerFactory.getFileManagerConfig = (_) => {
      return {
        displayIcon: 'mockIcon',
        displayName: 'mock',
        name: 'mock',
        path: '',
        typeClass: MockFileManager,
      };
    };
  });

  beforeEach((done: () => any) => {
    testFixture = fixture('file-browser-fixture');
    testFixture.ready()
      .then(() => {
        Polymer.dom.flush();
        done();
      });
  });

  it('uses the file manager specified in app settings', () => {
    assert(testFixture.fileManagerType === fileManagerSetting,
        'FileManager type should be ' + fileManagerSetting);
  });

  it('loads the root path and breadcrumbs correctly', () => {
    assert(testFixture.$.breadCrumbs.crumbs.length === 0,
        'breadcrumbs should only contain the root "/" character');
  });

  it('gets the current file correctly', () => {
    assert(testFixture.currentFile.id.path === '/', 'current file should be root');
  });

  it('displays list of files correctly', () => {
    const files: ItemListElement = testFixture.$.files;
    assert(files.rows.length === 3, 'should have three files');

    mockFiles.forEach((file: DatalabFile, i: number) => {
      assert(files.rows[i].columns[0] === file.name,
          'mock file ' + i + 'name not shown in first column');
      assert(files.rows[i].icon === file.icon, 'mock file ' + i + ' type not shown as icon');
    });
  });

  it('starts up with no files selected, and no files running', () => {
    const files: ItemListElement = testFixture.$.files;
    files.rows.forEach((row: ItemListRow, i: number) => {
      assert(!row.selected, 'file ' + i + ' should not be selected');
    });
  });
});
