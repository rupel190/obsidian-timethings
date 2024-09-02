import {
	Editor,
	MarkdownView,
	WorkspaceLeaf,
	Plugin,
	TFile,
	Notice,
	debounce,
} from "obsidian";
import { moment, Debouncer } from "obsidian";
import {
	MostEditedView,
	VIEW_TYPE_MOST_EDITED as VIEW_TYPE_MOST_EDITED,
} from "./mostedited.view";

import * as BOMS from "./BOMS";
import * as CAMS from "./CAMS";
import {
	DEFAULT_SETTINGS,
	TimeThingsSettings,
	TimeThingsSettingsTab,
} from "./settings";
import * as timeUtils from "./time.utils";
import * as gates from "./gates.utils";
import { allowedNodeEnvironmentFlags } from "process";

export default class TimeThings extends Plugin {
	settings: TimeThingsSettings;
	isDebugBuild: boolean;
	clockBar: HTMLElement; // # Required
	debugBar: HTMLElement;
	editDurationBar: HTMLElement;
	isEditing = false;

	async onload() {
        // Add commands
        this.addCommand(
            {
                id: 'Show most edited notes view',
                name: 'Most edited notes',
                callback: () => {
                    this.activateMostEditedNotesView();
                }
            }
        );

        // Add buttons
        this.addRibbonIcon("history", "Activate view", () => {
            this.activateMostEditedNotesView();
        });

        // Register views
		this.registerView(
			VIEW_TYPE_MOST_EDITED,
			(leaf) => new MostEditedView(leaf),
		);

        // Load settings
		await this.loadSettings();

		// Variables initialization
		this.isDebugBuild = true; // for debugging purposes TODO: WELL IS IT OR IS IT NOT APPARENTLY ITS NOT IF THIS TEXT IS HERE!

        // Set up Status Bar items
		this.setUpStatusBarItems();

		// Events initialization
		this.registerFileModificationEvent();
		this.registerKeyDownDOMEvent();
		this.registerLeafChangeEvent();
		this.registerMouseDownDOMEvent();

        // Add a tab for settings
		this.addSettingTab(new TimeThingsSettingsTab(this.app, this));

	}

    registerMouseDownDOMEvent() {
		this.registerDomEvent(document, "mousedown", (evt: MouseEvent) => {
			// Prepare everything
			const activeView =
				this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView === null) {
				return;
			}
			const editor: Editor = activeView.editor;
			if (editor.hasFocus() === false) {
				return;
			}

			this.onUserActivity(true, activeView, { updateMetadata: false, updateStatusBar: true });
		});
	}

	registerLeafChangeEvent() {
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				// Prepare everything
				const activeView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView === null) {
					return;
				}
				const editor = activeView.editor;
				if (editor.hasFocus() === false) {
					return;
				}

				// Change the duration icon in status bar
				this.onUserActivity(true, activeView, {
					updateMetadata: false,
                    updateStatusBar: true,
				});
			}),
		);
	}

	registerKeyDownDOMEvent() {
		this.registerDomEvent(document, "keyup", (evt: KeyboardEvent) => {
			// If CAMS enabled
			const ignoreKeys = [
				"ArrowDown",
				"ArrowUp",
				"ArrowLeft",
				"ArrowRight",
				"Tab",
				"CapsLock",
				"Alt",
				"PageUp",
				"PageDown",
				"Home",
				"End",
				"Meta",
				"Escape",
			];

			if (evt.ctrlKey || ignoreKeys.includes(evt.key)) {
				return;
			}

			if (this.settings.useCustomFrontmatterHandlingSolution === true) {
				// Make sure the document is ready for edit
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView === null) {
					this.isDebugBuild && console.log("No active view");
					return;
				}
				const editor: Editor = activeView.editor;
				if (editor.hasFocus() === false) {
					this.isDebugBuild && console.log("No focus");
					return;
				}

				// Update everything
				this.onUserActivity(true, activeView);
			}
		});
	}

	registerFileModificationEvent() {
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				// Make everything ready for edit
				const activeView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView === null) {
					return;
				}

				// Main
				if (
					this.settings.useCustomFrontmatterHandlingSolution === false
				) {
					this.onUserActivity(false, activeView);
				}
			}),
		);
	}
    

	async activateMostEditedNotesView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_MOST_EDITED);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({
				type: VIEW_TYPE_MOST_EDITED,
				active: true,
			});
		}

		// "Reveal" the leaf in case it is in a collapsed sidebar
		if(leaf) {
			workspace.revealLeaf(leaf);
		}
	}


	timeout: number = 3000; // TODO: Into settings.ts
	iconActive : boolean = false; // In a perfect world this matches the editing timer, but it's way simpler to decouple these variables
	// Inactive typing
	resetIcon = debounce(() => {
		this.clockBar.setText(`✋🔴`); //TODO: settings.ts
		this.iconActive = false;
		this.isDebugBuild && console.log('Deactivate typing icon, active: ', this.iconActive);
	}, this.timeout, true);
	
	// Active typing icon
	updateIcon() {
		if(!this.iconActive) {
			this.clockBar.setText(`✏🔵`);
			this.iconActive = true;
			this.isDebugBuild && console.log('Activate typing icon, active: ', this.iconActive);
		}
		this.resetIcon();
	}

	
	// not just on the setting as BOMS apparently requires a min of 10s 
	// -> TODO: Limit Timeout if BOMS is active! Provide slider + numberbox > 10 for BOMS, >1 for cams)
	
	// Run every x seconds starting from typing begin and update periodically
	startTime: number | null;
	updateEditedValue = debounce((useCustomSolution: boolean, activeView: MarkdownView) => {
			if(this.startTime) {
				this.updateMetadata(useCustomSolution, activeView);
			}
		}, this.timeout, false);

	resetEditing = debounce(() => {
		// Reset state
		this.isDebugBuild && console.log('Editing halted!');
		this.isEditing = false;
		this.startTime = null;
	}, this.timeout, true);

	updateEditing(useCustomSolution: boolean, activeView: MarkdownView) {
		// Save current time only once, regardless of repeated calls (flag)
		if(!this.isEditing) {
			this.isEditing = true;
			this.startTime = moment.now();
			console.log(`Editing ${this.isEditing} with startTime ${this.startTime}`);
		}
		this.updateEditedValue(useCustomSolution, activeView);
		this.resetEditing();
	}

	updateMetadata (useCustomSolution: boolean, activeView: MarkdownView) {
		let environment;
        useCustomSolution ? environment = activeView.editor : environment = activeView.file;
		if (
			useCustomSolution &&
			environment instanceof Editor
		) {
			// CAMS: Custom Asset Management System
			this.updateModifiedPropertyEditor(environment);
			if (this.settings.enableEditDurationKey) {
				console.log('calling cams!');
				this.updateDurationPropertyEditor(environment);
				
			}
		} else if (
			!useCustomSolution &&
			environment instanceof TFile
		) {
			// BOMS: Build-in Object Management System
			this.updateModifiedPropertyFrontmatter(environment);
			if (this.settings.enableEditDurationKey) {
				console.log('boms update');
				this.updateDurationPropertyFrontmatter(environment);
			}
		}
	}

    // A function for reading and editing metadata realtime
	// Gets called when a user changes a leaf, clicks a mouse, types in the editor, or modifies a file
	onUserActivity(
		useCustomSolution: boolean,
		activeView: MarkdownView,
		options: { updateMetadata: boolean, updateStatusBar: boolean, } = { updateMetadata: true, updateStatusBar: true, },
	) {
		const { updateMetadata, updateStatusBar } = options;
		let environment;
        useCustomSolution ? environment = activeView.editor : environment = activeView.file;
        
		// Check if the file is in the blacklisted folder
		// Check if the file has a property that puts it into a blacklist
		// Check if the file itself is in the blacklist
		
		console.log('--- User activity! ---');
		
        if (updateStatusBar) {
			this.updateIcon();
        }
		
		// Update metadata using either BOMS or CAMS
		if (updateMetadata) {
			this.updateEditing(useCustomSolution, activeView);
		}
	}

	// CAMS
    updateModifiedPropertyEditor(editor: Editor) {
		const dateNow = moment();
		const userDateFormat = this.settings.modifiedKeyFormat;
		const dateFormatted = dateNow.format(userDateFormat);

		const userModifiedKeyName = this.settings.modifiedKeyName;
		const valueLineNumber = CAMS.getLine(editor, userModifiedKeyName);

		if (typeof valueLineNumber !== "number") {
			this.isDebugBuild && console.log("Couldn't get the line number of last_modified property");
			return;
		}
		const value = editor.getLine(valueLineNumber).split(/:(.*)/s)[1].trim();
		if (moment(value, userDateFormat, true).isValid() === false) {
            // Little safecheck in place to reduce chance of bugs
            this.isDebugBuild && console.log("Wrong format of last_modified property");
			return;
		}
        // this.setValue(true, editor, userModifiedKeyName, dateFormatted,);
		CAMS.setValue(editor, userModifiedKeyName, dateFormatted);
	} 

	// BOMS (Default)
    async updateModifiedPropertyFrontmatter(file: TFile) {
		await this.app.fileManager.processFrontMatter(
			file as TFile,
			(frontmatter) => {
				const dateNow = moment();
				const dateFormatted = dateNow.format(
					this.settings.modifiedKeyFormat,
				);

				const updateKeyValue = moment(
					BOMS.getValue(frontmatter, this.settings.modifiedKeyName),
					this.settings.modifiedKeyFormat,
				);

				if (
					updateKeyValue.add(
						this.settings.updateIntervalFrontmatterMinutes,
						"minutes",
					) > dateNow
				) {
					return;
				}

				BOMS.setValue(
					frontmatter,
					this.settings.modifiedKeyName,
					dateFormatted,
				);
			},
		);
	}
	
	// CAMS
	async updateDurationPropertyEditor(editor: Editor) {
		// Fetch value
		let fieldLine: number | undefined = CAMS.getLine(editor, this.settings.editDurationKeyName); 
		if(fieldLine === undefined) {
			console.log("Undefined value for duration property");
			fieldLine = 0;
		}
		// Parse & check validity
		const value = editor.getLine(fieldLine).split(/:(.*)/s)[1].trim();
		const userDateFormat = this.settings.editDurationKeyFormat;
		if(moment(value, userDateFormat, true).isValid() === false) {
			this.isDebugBuild && console.log("Wrong format or invalid value with edit_duration property");
			return;
		}
		// Increment & set
		const incremented = moment.duration(value).add(this.timeout, 'milliseconds').format(userDateFormat, { trim: false }); // Always stick to given format
		this.isDebugBuild && console.log(`Increment CAMS from ${value} to ${incremented}`);
		CAMS.setValue(
			editor,
			this.settings.editDurationKeyName,
			incremented.toString(),
		);
	}

	// BOMS (Default)
    async updateDurationPropertyFrontmatter(file: TFile) {
        // Slow update
        await this.app.fileManager.processFrontMatter(
            file as TFile,
            (frontmatter: any) => {
				// Fetch
                let value = BOMS.getValue(frontmatter, this.settings.editDurationKeyName);
                if (value === undefined) {
					this.isDebugBuild && console.log('No edit_duration, initialize with 0.');
                    value = moment.duration(0);
                }
				// Check validity
				const userDateFormat = this.settings.editDurationKeyFormat;
				if(moment(value, userDateFormat, true).isValid() === false) {
					this.isDebugBuild && console.log("Wrong format for edit_duration property");
					return;
				}

				// TODO: Do this right in the settings. Maybe the date could also be validated directly in the settings?
				if(this.timeout < 10000) {
					console.log('Invalid timeout for BOMS, reset to 10 seconds.');
					this.timeout = 10000;
				}
				// Increment
				const incremented = moment.duration(value).add(this.timeout, 'milliseconds').format(userDateFormat, {trim: false});
				this.isDebugBuild && console.log(`Increment BOMS from ${value} to ${incremented}`, 0);
                BOMS.setValue(
                    frontmatter,
                    this.settings.editDurationKeyName,
                    incremented,
                );
            },
        );
    }

	
    // Don't worry about it
	updateClockBar() {
		const dateNow = moment();
		const dateUTC = moment.utc(); // Convert to UTC time

		const dateChosen = this.settings.isUTC ? dateUTC : dateNow;
		const dateFormatted = dateChosen.format(this.settings.clockFormat);
		const emoji = timeUtils.momentToClockEmoji(dateChosen);

		// TODO: Remove override
		// this.settings.showEmojiStatusBar
		// 	? this.clockBar.setText(emoji + " " + dateFormatted)
		// 	: this.clockBar.setText(dateFormatted);

	}

    // Gets called on OnLoad
    setUpStatusBarItems() {
		if (this.settings.enableClock) {
			// Add clock icon
			// Adds a status bar
			this.clockBar = this.addStatusBarItem();
			this.clockBar.setText(":)");

			// Change status bar text every second
			this.updateClockBar();
			this.registerInterval(
				window.setInterval(
					this.updateClockBar.bind(this),
					+this.settings.updateIntervalMilliseconds,
				),
			);
		}

	}

    // Don't worry about it
	onunload() {}

    // Don't worry about it
	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

    // Don't worry about it
	async saveSettings() {
		await this.saveData(this.settings);
	}
}
