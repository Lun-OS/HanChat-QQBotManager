import * as Blockly from 'blockly';

interface EditorState {
  isOpen: boolean;
  value: string;
  field: Blockly.Field | null;
  language: string;
}

interface Callbacks {
  openEditor: (value: string, field: Blockly.Field, language: string) => void;
}

let callbacks: Callbacks | null = null;

export const multilineEditorBridge = {
  setCallbacks: (cb: Callbacks) => {
    callbacks = cb;
  },

  openEditor: (value: string, field: Blockly.Field, language: string = 'lua') => {
    if (callbacks) {
      callbacks.openEditor(value, field, language);
    }
  },
};
