import {
	Editor,
	MarkdownView,
	WorkspaceLeaf,
	Plugin,
	TFile,
	Notice,
	debounce,
	moment
} from "obsidian";
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

	// Edit tracking
	isEditing = false; // Not a lock but used for tracking (Status bar)
	startTime: number | null; // How long was isEditing active
	activityIconActive : boolean = false; // Will match the editing timer of isEditing, but it's better to decouple these variables
	timeout: number; // Loaded from settings, timeout for tracking and periodic saving

	// Status bar
	clockBar: HTMLElement; // # Required
	editIndicatorBar: HTMLElement;
	debugBar: HTMLElement;
	
	// Debounced functions
	updateFrontmatter: (useCustomSolution: boolean, activeView: MarkdownView) => void;
	resetEditing: () => void;
	resetIcon: () => void;

	

	//#region Load plugin
	async onload() {
		// Load settings
		await this.loadSettings();

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

		// Variables initialization
		this.isDebugBuild = true; // for debugging purposes TODO: reset

        // Set up Status Bar items
		this.setUpStatusBarItems();

		// Events initialization
		// this.registerFileModificationEvent();
		this.registerKeyDownDOMEvent();
		this.registerLeafChangeEvent();
		this.registerMouseDownDOMEvent();

        // Add a tab for settings
		this.addSettingTab(new TimeThingsSettingsTab(this.app, this));
	}
	//#endregion


	//#region UserActivity events
	// CAMS
	registerLeafChangeEvent() {
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				// Prepare everything
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				const useCustom : boolean = this.settings.useCustomFrontmatterHandlingSolution;
				this.isDebugBuild && console.log(`Key down, use: ${useCustom ? "CAMS" : "BOMS"}`);

				if (activeView === null) {
					return;
				}

				if(useCustom) {
					const editor = activeView.editor;
					if (editor.hasFocus() === false) {
						return;
					}
				}
				this.onUserActivity(useCustom, activeView);
			}),
		);
	}

	// CAMS
	registerKeyDownDOMEvent() {
		this.registerDomEvent(document, "keyup", (evt: KeyboardEvent) => {
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

			// Make sure the document is ready for edit
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			const useCustom : boolean = this.settings.useCustomFrontmatterHandlingSolution;
			// this.isDebugBuild && console.log(`Key down, use: ${useCustom ? "CAMS" : "BOMS"}`);
			
			if (activeView === null) {
				this.isDebugBuild && console.log("No active view");
				return;
			}

			if (useCustom) {
				const editor: Editor = activeView.editor;
				if (editor.hasFocus() === false) {
					this.isDebugBuild && console.log("No focus");
					return;
				}			
			}
			this.onUserActivity(useCustom, activeView);
		});
	}

	// BOMS
	// registerFileModificationEvent() {
	// 	// ! If BOMS is updated it triggers a new file modification event
	// 	this.registerEvent(
	// 		this.app.vault.on("modify", (file) => {
	// 			// Make everything ready for edit
	// 			const activeView =
	// 				this.app.workspace.getActiveViewOfType(MarkdownView);
	// 			if (activeView === null) {
	// 				return;
	// 			}
	// 			console.log('filemod');

	// 			if (this.settings.useCustomFrontmatterHandlingSolution === false) {
	// 				this.onUserActivity(false, activeView);
	// 			}
	// 		}),
	// 	);
	// }

	// NONE
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

			this.onUserActivity(true, activeView, { updateMetadata: false, updateTypingIndicator: false });
		});
	}
	// #endregion
    

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


	//region Editing tracking

	updateEditing(useCustomSolution: boolean, activeView: MarkdownView) {
		// Save current time only once, regardless of repeated calls (flag)
		if(!this.isEditing) {
			this.isEditing = true;
			this.startTime = moment.now();
			this.isDebugBuild && console.log(`Editing ${this.isEditing} with startTime `, moment(this.startTime).format(this.settings.modifiedKeyFormat));
		}
		this.updateFrontmatter(useCustomSolution, activeView);
		this.resetEditing();
	}

	validEditDuration() : number | null {
		const diffSeconds = (moment.now() - moment.duration(this.startTime).asMilliseconds()) / 1000;
		return isNaN(diffSeconds) ? null : diffSeconds;
	}

	updateMetadata (useCustomSolution: boolean, activeView: MarkdownView) {
		let environment;
        useCustomSolution ? environment = activeView.editor : environment = activeView.file;
		const editDiff = this.validEditDuration()
		const modificationThreshold = this.settings.modifiedThreshold/1000;

		if (useCustomSolution && environment instanceof Editor) {
			// CAMS: Custom Asset Management System
			console.log("Calling CAMS handler");
			if(editDiff !== null && editDiff >= modificationThreshold) {
				this.isDebugBuild && console.log(`Modified property threshold reached with ${editDiff}s, update property!`)
				this.updateModifiedPropertyCAMS(environment);
			}
			if (this.settings.enableEditDurationKey) {
				this.updateDurationPropertyCAMS(environment);
			}
		} else if (!useCustomSolution && environment instanceof TFile) {			
			// BOMS: Build-in Object Management System
			console.log("Calling BOMS handler");
			if(editDiff !== null && editDiff >= modificationThreshold) {
				this.isDebugBuild && console.log(`Modified property threshold reached with ${editDiff}s, update property!`)
				this.updateModifiedPropertyBOMS(environment);
			}
			if (this.settings.enableEditDurationKey) {
				this.updateDurationPropertyBOMS(environment);
			}
		}
	}

	// Called on typing
	onUserActivity(
		useCustomSolution: boolean,
		activeView: MarkdownView,
		options: { updateMetadata: boolean, updateTypingIndicator: boolean, } = { updateMetadata: true, updateTypingIndicator: true, },
	) {
		const { updateMetadata, updateTypingIndicator } = options;
		let environment;
        useCustomSolution ? environment = activeView.editor : environment = activeView.file;

		// Check if the file is in the blacklisted folder
		// Check if the file has a property that puts it into a blacklist
		// Check if the file itself is in the blacklist
		
		if (updateMetadata) {
			// Update metadata using either BOMS or CAMS
			// this.isDebugBuild && console.log(`UserActivity: ${useCustomSolution ? "CAMS" : "BOMS"}, with timeout ${this.timeout}`);
			if(updateTypingIndicator) {
				this.updateIcon();
			}
			this.updateEditing(useCustomSolution, activeView);
		}
	}
	//#endregion


	//#region Frontmatter update modified

	// CAMS
    updateModifiedPropertyCAMS(editor: Editor) {
		this.isDebugBuild && console.log('*** CAMS: Update modified property! ***');
		// With the old solution updating frontmatter keys only worked on BOMS!
		// todo: allow key changes
		const userDateFormat = this.settings.modifiedKeyFormat; // Target format. Existing format unknown and irrelevant.
		const userModifiedKeyName = this.settings.modifiedKeyName;
		const dateFormatted = moment().format(userDateFormat);

		const fetched = CAMS.getLine(editor, this.settings.modifiedKeyName)
		if(fetched === undefined) {
			// TODO: Initialize somehow, cause it's not crfeated by using CAMS!
			console.log("!!!Attempt to init frontmatter");
			BOMS.setValue(editor, userModifiedKeyName, dateFormatted);
		}
		CAMS.setLine(editor, userModifiedKeyName, dateFormatted);
	} 

	// BOMS (Default)
    async updateModifiedPropertyBOMS(file: TFile) {
		this.isDebugBuild && console.log('*** BOMS: Update modified property! ***');
		await this.app.fileManager.processFrontMatter(
			file as TFile,
			(frontmatter) => {
				const dateFormatted = moment().format(this.settings.modifiedKeyFormat);
				// BOMS creates key if it doesn't exist
				BOMS.setValue(frontmatter, this.settings.modifiedKeyName, dateFormatted);
			},
		);
	}
	
	//#region Frontmatter update duration

	
	// CAMS
	async updateDurationPropertyCAMS(editor: Editor) {
		this.isDebugBuild && console.log('*** CAMS: Update duration property! ***');
		// With the old solution updating frontmatter keys only worked on BOMS!

		//TODO update

		
		// Fetch edit duration
		const fieldLine: number | undefined = CAMS.getLine(editor, this.settings.editDurationKeyName); 
		const userDateFormat = this.settings.editDurationKeyFormat;
		let newValue : any;
		
		if(fieldLine === undefined) {
			console.log(`Undefined value for ${this.settings.editDurationKeyName}`);
			newValue = moment.duration(0, "minutes").format(userDateFormat, { trim: false })
		} else {
			newValue = editor.getLine(fieldLine).split(/:(.*)/s)[1].trim();
			// const test = moment(newValue, userDateFormat, true).isValid()
		}
		this.isDebugBuild && console.log(`Current edit duration ${newValue} and current/new formatter ${userDateFormat}`);

		// Increment & set
		const incremented = moment.duration(newValue).add(this.timeout, 'milliseconds').format(userDateFormat, { trim: false }); // Always stick to given format
		this.isDebugBuild && console.log(`Increment CAMS edit duration from ${newValue} to ${incremented}`);
		CAMS.setLine(editor, this.settings.editDurationKeyName, incremented.toString());
	}

	// BOMS (Default)
	/* Date updating is delicate: Moment.js validity check might check an updated setting
		against a pre-existing date and would return false. So it would never act on format changes.
		Instead: Check existing duration for general validity. Increment. Display. (Format is validated in settings)
	*/ 
    async updateDurationPropertyBOMS(file: TFile) {
		this.isDebugBuild && console.log('*** BOMS: Update duration property! ***');
        // Slow update
        await this.app.fileManager.processFrontMatter(
            file as TFile,
            (frontmatter: any) => {
				// Fetch
                let value = BOMS.getValue(frontmatter, this.settings.editDurationKeyName);
				// Zero if non-existent
                if (value === undefined) {
					this.isDebugBuild && console.log('No edit duration, initialize with 0.');
                    value = moment.duration(0);
                }
				// Check for general validity
				if(!moment.duration(value).isValid()) {
					console.log(`Unable to update ${this.settings.editDurationKeyName} due to invalid value of ${value}.`);
					return;
				}
				// Increment
				const userDateFormat = this.settings.editDurationKeyFormat;
				const incremented = moment.duration(value).add(this.timeout, 'milliseconds').format(userDateFormat, {trim: false});
				this.isDebugBuild && console.log(`Increment BOMS from ${value} to ${incremented}`);
                BOMS.setValue(
                    frontmatter,
                    this.settings.editDurationKeyName,
                    incremented,
                );
            },
        );
    }
	//#endregion


	//#region Status bar
    // Don't worry about it
	updateClockBar() {
		const dateNow = moment();
		const dateUTC = moment.utc(); // Convert to UTC time

		const dateChosen = this.settings.isUTC ? dateUTC : dateNow;
		const dateFormatted = dateChosen.format(this.settings.clockFormat);
		const emoji = timeUtils.momentToClockEmoji(dateChosen);
		
		this.clockBar.setText(emoji + " " + dateFormatted)
		// this.settings.enableClock
		// 	? this.clockBar.setText(emoji + " " + dateFormatted)
		// 	: this.clockBar.setText(dateFormatted);
	}

	// Typing indicator
	updateIcon() {
		if(!this.activityIconActive) {
			this.editIndicatorBar.setText(this.settings.editIndicatorActive);
			this.activityIconActive = true;
			this.isDebugBuild && console.log('Activate typing icon, active: ', this.activityIconActive, this.settings.editIndicatorActive);
		}
		this.resetIcon();
	}

    // Called on OnLoad, adds status bar
    setUpStatusBarItems() {
		// Clock
		if (this.settings.enableClock) {
			this.clockBar = this.addStatusBarItem();
			this.clockBar.setText(timeUtils.momentToClockEmoji(moment()));

			// Change status bar text every second
			this.updateClockBar();
			this.registerInterval(
				window.setInterval(
					this.updateClockBar.bind(this),
					+ this.timeout,
				),
			);
		}
		// Typing indicator
		if (this.settings.enableEditIndicator) {
			this.editIndicatorBar = this.addStatusBarItem();
			this.editIndicatorBar.setText(this.settings.editIndicatorInactive);
		}
	}
	//#endregion


    // Don't worry about it
	onunload() {}

	
	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);

		this.timeout = this.settings?.typingTimeoutMilliseconds;
		if(!this.timeout || isNaN(this.timeout) || this.timeout === undefined) {
			console.log(`Timeout setting ${this.timeout} invalid, fallback!`);
			this.timeout = 10000;
		}

		this.isDebugBuild && console.log("LOAD settings: ", this.timeout);
		// Because the methods are stored in a variable, the values inside the closure will be stale.
		// Reloading here keeps it fresh and decoupled from the settings file.
		this.updateFrontmatter = debounce((useCustomSolution: boolean, activeView: MarkdownView) => {
			if(this.startTime) {
				this.isDebugBuild && console.log(`Update frontmatter using ${useCustomSolution ? "CAMS" : "BOMS"}`);
				this.updateMetadata(useCustomSolution, activeView);
			}
		}, this.timeout);
				
		this.resetIcon = debounce(() => {
			// Inactive typing
			this.editIndicatorBar.setText(this.settings.editIndicatorInactive);
			this.activityIconActive = false;
			this.isDebugBuild && console.log('Deactivate typing icon, active: ', this.activityIconActive, this.settings.editIndicatorInactive);
		}, this.timeout, true);

		this.resetEditing = debounce(() => {
			// Reset state
			let diff: number = moment.now() - moment.duration(this.startTime).asMilliseconds();
			this.isDebugBuild && console.log(`Editing halted after ${diff/1000}s.`);
			this.isEditing = false;
			this.startTime = null;
		}, this.timeout, true);
	}

    // Don't worry about it
	async saveSettings() {
		this.isDebugBuild && console.log("SAVE settings")
		await this.saveData(this.settings);
		await this.loadSettings();
	}
}
