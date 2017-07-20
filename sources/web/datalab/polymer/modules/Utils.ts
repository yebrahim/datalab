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
 * Options for opening a dialog.
 */
interface DialogOptions {
  title: string,
  messageHtml?: string,
  bodyHtml?: string,
  inputLabel?: string,
  inputValue?: string,
  okLabel?: string,
  cancelLabel?: string,
  big?: boolean,
}

/**
 * Class provides helper methods for various operations.
 */
class Utils {

  /**
   * Opens a dialog with the specified options. It uses the Datalab custom element
   * according to the specified dialog type, attaches a new instance to the current
   * document, opens it, and returns a promise that resolves when the dialog is closed.
   * @param type specifies which type of dialog to use
   * @param dialogOptions specifies different options for opening the dialog
   */
  static showDialog(dialogType: typeof BaseDialogElement, dialogOptions: DialogOptions):
                                                                  Promise<BaseDialogCloseResult> {
    const dialog = <any>document.createElement(dialogType.is);
    document.body.appendChild(dialog);

    if (dialogOptions.title)
      dialog.title = dialogOptions.title;
    if (dialogOptions.messageHtml)
      dialog.messageHtml = dialogOptions.messageHtml;
    if (dialogOptions.inputLabel)
      dialog.inputLabel = dialogOptions.inputLabel;
    if (dialogOptions.inputValue)
      dialog.inputValue = dialogOptions.inputValue;
    if (dialogOptions.okLabel)
      dialog.okLabel = dialogOptions.okLabel;
    if (dialogOptions.cancelLabel)
      dialog.cancelLabel = dialogOptions.cancelLabel;
    if (dialogOptions.big !== undefined)
      dialog.big = dialogOptions.big;

    // Open the dialog
    return new Promise(resolve => {
      dialog.openAndWaitAsync((closeResult: InputDialogCloseResult) => {
        document.body.removeChild(dialog);
        resolve(closeResult);
      });
    });
  }

  /**
   * Utility function that helps with the Polymer inheritance mechanism. It takes the subclass,
   * the superclass, and an element selector. It loads the templates for the two classes,
   * and inserts all of the elements from the subclass into the superclass's template, under
   * the element specified with the CSS selector, then returns the merged template.
   * 
   * This allows for a very flexible expansion of the superclass's HTML template, so that we're
   * not limited by wrapping the extended element, but we can actually inject extra elements
   * into its template, all while extending all of its javascript and styles.
   * @param subType template of the sub-element
   * @param baseType the template of the element being extended
   */
  static stampInBaseTemplate(subType: string, baseTypeTemplate: PolymerTemplate) {

    const subtypeTemplate = Polymer.DomModule.import(subType, 'template');

    // Clone the base template; we don't want to change it in-place
    const stampedTemplate = baseTypeTemplate.cloneNode(true) as PolymerTemplate;

    // Find insertion points in base template
    const insertionPoints = stampedTemplate.content.querySelectorAll('.__insertionPoint');

    // For each insertion point, find the subclass template's corresponding element
    insertionPoints.forEach((insertionPoint: HTMLElement) => {
      const insertedElement = subtypeTemplate.content.querySelector('#' + insertionPoint.id);
      if (!insertedElement) {
        throw new Error('Cannot extend template, missing insertion point: #' + insertionPoint.id);
      }

      // Remove the insertion point entirely and replace it with the contents of
      // the inserted element
      insertionPoint.outerHTML = insertedElement.innerHTML;
    });

    // Now insert style element
    const baseStyle = stampedTemplate.content.querySelector('style') || new HTMLStyleElement();
    const subStyle = subtypeTemplate.content.querySelector('style') || new HTMLStyleElement();

    baseStyle.innerHTML += subStyle.innerHTML;

    return stampedTemplate;
  }

  /**
   * Moves all child elements from one element to another.
   * @param from element whose children to move
   * @param to destination elements where children will be moved to
   */
  static moveElementChildren(from: HTMLElement, to: HTMLElement) {
    while (from.firstChild) {
      to.appendChild(from.firstChild);
    }
  }

}

/**
 * A custom even class that signals a notification should be shown with a message,
 * or hidden. The event can be fired on any element in the DOM tree, and will bubble up.
 * @param message notification message to show
 * @param show whether the notification toast should be shown or hidden. Default true.
 * @param sticky whether the notification should stick around until dismissed. Default false.
 */
class NotificationEvent extends CustomEvent {
  constructor(message: string = '', show: boolean = true, sticky: boolean = false) {

    const eventInit = {
      bubbles: true,
      composed: true, // Needed to pierce the shadow DOM boundaries
      detail: {
        show: show,
        sticky: sticky,
        message: message,
      },
    }

    super('notification', eventInit);
  }
}
