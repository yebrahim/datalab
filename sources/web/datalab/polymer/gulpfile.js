const del = require('del');
const gulpif = require('gulp-if');
const uglify = require('gulp-uglifyes');
const tslint = require('gulp-tslint');
const ts = require('gulp-typescript');
const gulpinstall = require("gulp-install");
const gulpBabel = require('gulp-babel');
const cssSlam = require('css-slam').gulp;
const htmlMinifier = require('gulp-html-minifier');
const HtmlSplitter = require('polymer-build').HtmlSplitter;
const PolymerProject = require('polymer-build').PolymerProject;
const gulp = require('gulp');
const mergeStream = require('merge-stream');
const gutil = require('gulp-util')
const {generateCountingSharedBundleUrlMapper,
  generateSharedDepsMergeStrategy} = require('polymer-bundler');

const project = new PolymerProject({
  shell: "components/datalab-app/datalab-app.html",
  fragments: [
    "components/data-browser/data-browser.html",
    "components/datalab-docs/datalab-docs.html",
    "components/datalab-editor/datalab-editor.html",
    "components/datalab-sessions/datalab-sessions.html",
    "components/datalab-sidebar/datalab-sidebar.html",
    "components/datalab-terminal/datalab-terminal.html",
    "components/datalab-toolbar/datalab-toolbar.html",
    "components/file-browser/file-browser.html",
    "components/notebook-preview/notebook-preview.html",
    "components/table-inline-details/table-inline-details.html",
    "components/table-preview/table-preview.html",
    "components/text-preview/text-preview.html"
  ],
  sources: [
    "editor.html",
    "editor.js",
    "images/**/*",
    "index.*.css",
    "modules/**/*.js",
    "notebook.html",
    "notebook.js",
    "templates/*.ipynb"
  ],
  extraDependencies: [
    "bower_components/codemirror/addon/**",
    "bower_components/codemirror/lib/*",
    "bower_components/codemirror/mode/**",
    "bower_components/codemirror/theme/*",
    "bower_components/monaco-editor/release/min/vs/**",
    "bower_components/webcomponentsjs/webcomponents-lite.js"
  ]
});

const sourcesHtmlSplitter = new HtmlSplitter();

gulp.task('clean', () => del(['build']));

gulp.task('install', () => {
  return gulp.src(['./bower.json', './package.json'])
    .pipe(gulpinstall());
});

gulp.task('lint', () => {
  return gulp.src(['*.ts', 'components/**/*.ts', 'modules/**/*.ts', 'test/**/*.ts'])
    .pipe(tslint({
      configuration: 'tslint.json',
      formatter: 'stylish',
    }))
    .pipe(tslint.report({
      summarizeFailureOutput: true,
    }));
});

gulp.task('transpile', () => {
  const tsProject = ts.createProject('tsconfig.json');
  const tsResult = tsProject.src()
    .pipe(tsProject());

  return tsResult.js
    .pipe(gulp.dest('.'));
});

gulp.task('unbundled', () => {
  // Create a build pipeline to pipe both streams together to the 'build/' dir
  return mergeStream(project.sources(), project.dependencies())
    .pipe(gulp.dest('../../../../build/web/nb/static/experimental'));
});

gulp.task('bundled', () => {
  const sourcesStream = project.sources()
    .pipe(sourcesHtmlSplitter.split()) // split inline JS & CSS out into individual .js & .css files
    .pipe(gulpif(/\.js$/, uglify({
      mangle: false,
      ecma: 6,
    })))
    .pipe(gulpif(/\.css$/, cssSlam()))
    .pipe(gulpif(/\.html$/, htmlMinifier({
      collapseWhitespace: true,
      minifyCSS: true,
      minifyJS: true,
      removeComments: true,
    })))
    .pipe(sourcesHtmlSplitter.rejoin()); // rejoins those files back into their original location

  // Create a build pipeline to pipe both streams together to the 'build/' dir
  return mergeStream(sourcesStream, project.dependencies())
    .pipe(project.bundler({
      sourcemaps: true,
      stripComments: true,
      strategy: generateSharedDepsMergeStrategy(3),
      urlMapper: generateCountingSharedBundleUrlMapper('shared/bundle_'),
    }))
    .pipe(gulp.dest('../../../../build/web/nb/static/experimental'));
});

gulp.task('dev', ['install', 'lint', 'transpile', 'unbundled']);
gulp.task('deploy', ['install', 'lint', 'transpile', 'bundled']);
