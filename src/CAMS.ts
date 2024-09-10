import { Editor } from "obsidian";

export function getLine(editor: Editor, fieldPath: string): number | undefined {
    const frontmatterLine = frontmatterEndLine(editor);
    const keys = fieldPath.split(".");

    if (frontmatterLine === undefined) {
        return undefined;
    }

    let targetDepth = 1;
    let startLine = 1;
    let emergingPath = [];

    for (const key of keys) {
        for (let i = startLine; i <= frontmatterLine; i++) {
            const currentLine = editor.getLine(i);
            const currentField = currentLine.split(":");
            const currentFieldName = currentField[0].trim();

            if (currentFieldName === key) {
                emergingPath.push(currentFieldName);
                const targetPath = fieldPath.split(".");
                const targetPathShrink = targetPath.slice(0, emergingPath.length);
                if (
                    (targetPathShrink.join(".") === emergingPath.join("."))
                    === false
                ) {
                    emergingPath.pop();
                    startLine = i + 1;
                    continue;
                } else {
                    if (emergingPath.join(".") === fieldPath) {
                        if (targetDepth > 1) {
                            if (this.isLineIndented(currentLine) === false) {
                                // met first level variable, obviously return
                                return undefined;
                            }
                        } else {
                            if (isLineIndented(currentLine)) {
                                startLine = i + 1;
                                emergingPath = [];
                                continue;
                            }
                        }
                        return i;
                    }
                    startLine = i + 1;
                    targetDepth += 1;
                    continue;
                }
            }
        }
    }

    return undefined;
}

export function setLine(editor: Editor, fieldPath: string, fieldValue: string,) {
    // Check for frontmatter
    if(!isFrontmatterPresent(editor)) {
        // Create empty frontmatter
        editor.setLine(0, "---\n---\n");
    }
    // Check for path
    if(!fieldPathPresent(editor, fieldPath)) {
        appendNewLine(editor, fieldPath, fieldValue);
    } else {
	    overrideCurrentLine(editor, fieldPath, fieldValue);
    }
}

//#region private
function isLineIndented(line: string): boolean {
	return /^[\s\t]/.test(line);
}


function isFrontmatterPresent(editor: Editor): boolean {
	if (editor.getLine(0) !== "---") {
		return false;
	}

	for (let i = 1; i <= editor.lastLine(); i++) {
		if (editor.getLine(i) === "---") {
			return true;
		}
	}
	return false;
}

function frontmatterEndLine(editor: Editor): number | undefined {
	if (isFrontmatterPresent(editor)) {
		for (let i = 1; i <= editor.lastLine(); i++) {
			if (editor.getLine(i) === "---") {
				return i;
			}
		}
	}
	return undefined; // # End line not found
}

function fieldPathPresent(editor: Editor, fieldPath: string): boolean {
    const pathValue = getLine(editor, fieldPath)
    if(pathValue) {
        return true;
    }
    return false;
}

function appendNewLine(editor: Editor, fieldPath: string, fieldValue: string) {
    const endLine = frontmatterEndLine(editor);
    if(!endLine) {
        console.log("No frontmatter endline found!");
        return;
    }
    editor.setLine(endLine, fieldPath + ": " + fieldValue + "\n---");
}

function overrideCurrentLine(editor: Editor, fieldPath: string, fieldValue: string) {
    const currentValue = getLine(editor, fieldPath);
    if (currentValue === undefined) {
        console.log("Value not found!");
        return;
    }
    const initialLine = editor.getLine(currentValue).split(":", 1);
    const newLine = initialLine[0] + ": " + fieldValue;
    editor.setLine(currentValue, newLine);
}
//#endregion