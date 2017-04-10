define('/static/settings', function(require, exports, module) {
  userSettings = null;
  settingsAddress = 'http://localhost:8081/_settings'

  function getSetting(key, callback) {
    if (userSettings !== null) {
      callback(userSettings[key]);
    } else {
      $.getJSON(settingsAddress, (settings) => {
        userSettings = settings;
        callback(settings[key]);
      });
    }
  }

  function populateSettings() {
    // Prepare the theme selector radio boxes
    lightThemeRadioOption = $('#lightThemeRadioOption')[0]
    darkThemeRadioOption = $('#darkThemeRadioOption')[0]

    // By default, check the light theme radio button
    // TODO: When we have support for default settings on server side, remove this
    lightThemeRadioOption.checked = true;
    darkThemeRadioOption.checked = false;
    getSetting('theme', (theme) => {
      lightThemeRadioOption.checked = theme === 'light';
      darkThemeRadioOption.checked = theme === 'dark';
    });
    lightThemeRadioOption.onclick = () => {
      setTheme('light');
      darkThemeRadioOption.checked = false;
    };
    darkThemeRadioOption.onclick = () => {
      setTheme('dark');
      lightThemeRadioOption.checked = false;
    };

    // Prepare the show ruler checkbox
    rulerCheckbox = $('#showRulerCheckbox')[0];
    rulerCheckbox.onchange = () => {
      setRulers(rulerCheckbox.checked);
    }
  }

  function setTheme(theme) {
    $.post(settingsAddress, {
      'key': 'theme',
      'value': theme
      }, () => {
        // Reload the stylesheet by resetting its address with a random (time) version querystring
        sheetAddress = document.getElementById('themeStylesheet').href + '?v=' + Date.now()
        document.getElementById('themeStylesheet').setAttribute('href', sheetAddress);
      });
  }

  function setRulers(show=true) {
    rulers = show? [{
      color: '#666',
      column: 80,
      lineStyle: 'dashed'
    }] : null;
    require(['notebook/js/codecell', 'codemirror/addon/display/rulers'], function(codecell) {
      // Apply when new cells are created
      codecell.CodeCell.options_default.cm_config.rulers = rulers;
      // Apply to existing cells
      Jupyter.notebook.get_cells().forEach(function (cell) {
        if (cell instanceof codecell.CodeCell) {
            cell.code_mirror.setOption('rulers', rulers);
        }
      });
    });
  }

  module.exports = {
    getSetting: getSetting,
    populateSettings: populateSettings,
    setTheme: setTheme,
    setRulers: setRulers,
  };
});
