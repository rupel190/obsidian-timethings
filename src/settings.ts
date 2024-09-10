import { App, PluginSettingTab, Setting, SliderComponent, TextComponent } from "obsidian";
import TimeThings from "./main";
import moment from "moment";

export interface TimeThingsSettings {
    //CAMS/BOMS
	useCustomFrontmatterHandlingSolution: boolean;
	typingTimeoutMilliseconds: number;

    //CLOCK
	clockFormat: string;
	enableClock: boolean;
	isUTC: boolean;
	
    //MODIFIED KEY
	enableModifiedKey: boolean;
	modifiedKeyName: string;
	modifiedKeyFormat: string;
	modifiedThreshold: number;
	
    //DURATION KEY
	enableEditDurationKey: boolean;
	editDurationKeyName: string;
	editDurationKeyFormat: string;
	
	// EDIT INDICATOR
	enableEditIndicator: boolean;
	editIndicatorActive: string;
	editIndicatorInactive: string;
}

export const DEFAULT_SETTINGS: TimeThingsSettings = {
	useCustomFrontmatterHandlingSolution: false,
	typingTimeoutMilliseconds: 10000, // Default setting is BOMS, which triggers an endless loop due to the file modification event when going <10s

	clockFormat: "hh:mm A",
	enableClock: true,
	isUTC: false,
	
	modifiedKeyName: "updated_at",
	modifiedKeyFormat: "YYYY-MM-DD[T]HH:mm:ss.SSSZ",
	enableModifiedKey: true,
	modifiedThreshold: 30000,
	
	editDurationKeyName: "edited_seconds",
	editDurationKeyFormat: "HH:mm:ss",
	enableEditDurationKey: true,
	
	// EDIT INDICATOR
	enableEditIndicator: true,
	editIndicatorActive: "✏🔵",
	editIndicatorInactive: "✋🔴",
};

export class TimeThingsSettingsTab extends PluginSettingTab {
	plugin: TimeThings;

	constructor(app: App, plugin: TimeThings) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// #region Prerequisites
		const createLink = () => {
			const linkEl = document.createDocumentFragment();

			linkEl.append(
				linkEl.createEl("a", {
					href: "https://momentjscom.readthedocs.io/en/latest/moment/04-displaying/01-format/",
					text: "Moment.js date format documentation",
				}),
			);
			return linkEl;
		};
		// #endregion



		// #region General
		let mySlider : SliderComponent;
		let myText: TextComponent;
		const minTimeoutBoms = 10; // Not sure
		const minTimeoutCams = 1;

		new Setting(containerEl)
			.setName("Use custom frontmatter handling solution")
			.setDesc("Smoother experience. Prone to bugs if you use a nested value.",)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useCustomFrontmatterHandlingSolution,)
					.onChange(async (newValue) => {
						// console.log("Use custom frontmatter handling: ", newValue);
						this.plugin.settings.useCustomFrontmatterHandlingSolution = newValue;
						// await this.display(); // UI update obsolete

						if (this.plugin.settings.useCustomFrontmatterHandlingSolution) {
							// CAMS: Reset lower limit
							mySlider.setLimits(minTimeoutCams, 90, 1);
						} 
						else {
							// BOMS: Raise lower limit and bump if below
							// console.log("Slider lower limit: ", mySlider.getValue());
							mySlider.setLimits(minTimeoutBoms, 90, 1);
							if(this.plugin.settings.typingTimeoutMilliseconds < minTimeoutBoms * 1000) {
								this.plugin.settings.typingTimeoutMilliseconds = minTimeoutBoms * 1000;
								myText.setValue(minTimeoutBoms.toString());
								// console.log("Bump BOMS timeout", this.plugin.settings.typingTimeoutMilliseconds);
							}
						}
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl.createDiv({cls: "textbox"}))
			.setName("Editing Timeout")
			.setDesc("In seconds. Time to stop tracking after interaction has stopped. Value also used for saving interval. Textbox allows for higher values.")
			.addSlider((slider) => mySlider = slider // implicit return without curlies
			.setLimits(minTimeoutBoms, 90, 1)
			.setValue(this.plugin.settings.typingTimeoutMilliseconds / 1000)
			.onChange(async (value) => {
				myText.setValue(value.toString());
				// Validity check including BOMS limit
				const useCustom = this.plugin.settings.useCustomFrontmatterHandlingSolution;
				if(
					value < (useCustom? minTimeoutCams : minTimeoutBoms) 
					|| isNaN(value)
				) {
					myText.inputEl.addClass('invalid-format');
				} else {
					myText.inputEl.removeClass('invalid-format');
					this.plugin.settings.typingTimeoutMilliseconds = value * 1000;
					await this.plugin.saveSettings();
				}
		})
		.setDynamicTooltip(),
		)
		.addText((text) => {
				myText = text
				.setPlaceholder("50")
				.setValue((this.plugin.settings.typingTimeoutMilliseconds/1000).toString(),)
				.onChange(async (value) => {
					const numericValue = parseInt(value, 10);
					this.plugin.settings.typingTimeoutMilliseconds = numericValue * 1000;
					mySlider.setValue(numericValue);
					await this.plugin.saveSettings();
				})
		});
		// #endregion


		// #region Status bar
		containerEl.createEl("h1", { text: "Status bar" });
		containerEl.createEl("p", { text: "Display symbols in the status bar" });
        containerEl.createEl("h2", { text: "🕰️ Clock" });

		new Setting(containerEl)
			.setName("Enable clock")
			.setDesc(
				"Show clock on the status bar? This setting requires restart of the plugin.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableClock)
					.onChange(async (newValue) => {
						this.plugin.settings.enableClock = newValue;
						await this.plugin.saveSettings();
						await this.plugin.loadSettings();
						await this.display();
					}),
			);

		if (this.plugin.settings.enableClock === true) {
			new Setting(containerEl)
				.setName("Date format")
				.setDesc(createLink())
				.addText((text) =>
					text
						.setPlaceholder("hh:mm A")
						.setValue(this.plugin.settings.clockFormat)
						.onChange(async (formatter) => {
							// Validate formatter by using it
							const formatTest = moment().format(formatter);
							const valid = moment(formatTest, formatter).isValid();
							if(!valid) {
								text.inputEl.addClass('invalid-format');
							} else {
								text.inputEl.removeClass('invalid-format');
								this.plugin.settings.clockFormat = formatter;
								await this.plugin.saveSettings();
							}
						}),
				);

			new Setting(containerEl)
				.setName("UTC timezone")
				.setDesc("Use UTC instead of local time?")
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.isUTC)
						.onChange(async (newValue) => {
							this.plugin.settings.isUTC = newValue;
							await this.plugin.saveSettings();
						}),
				);
		}

		containerEl.createEl("h2", { text: "✏ Typing indicator" });	
		new Setting(containerEl)
			.setName("Enable typing indicator")
			.setDesc("Show typing indicator in the status bar? This setting requires restart of the plugin.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableEditIndicator)
					.onChange(async (newValue) => {
						this.plugin.settings.enableEditIndicator = newValue;
						await this.plugin.saveSettings();
						await this.display();
					}),
			);

		if (this.plugin.settings.enableEditIndicator === true) {
			new Setting(containerEl.createDiv({cls: "statusBarTypingIndicator"}))
				.setName("Icon for tracking active/inactive")
				.addText((text) =>
					text
						.setPlaceholder("Active")
						.setValue(this.plugin.settings.editIndicatorActive)
						.onChange(async (value) => {
							// console.log('update active tracking icon: ', value)
							this.plugin.settings.editIndicatorActive = value;
							await this.plugin.saveSettings();
						}),
				)
				.addText((text) =>
					text
						.setPlaceholder("Inactive")
						.setValue(this.plugin.settings.editIndicatorInactive)
						.onChange(async (value) => {
							// console.log('update inactive tracking icon: ', value)
							this.plugin.settings.editIndicatorInactive = value;
							await this.plugin.saveSettings();
						}),
				);
		}
		// #endregion


		// #region Frontmatter
		containerEl.createEl("h1", { text: "Frontmatter" });
		containerEl.createEl("p", { text: "Handles timestamp keys in frontmatter." });

		// Modified timestamp
		containerEl.createEl("h2", { text: "🔑 Modified timestamp" });
		containerEl.createEl("p", { text: "Track the last time a note was edited." });
		
		new Setting(containerEl)
			.setName("Enable update of the modified key")
			.setDesc("")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableModifiedKey)
					.onChange(async (newValue) => {
						this.plugin.settings.enableModifiedKey = newValue;
						await this.plugin.saveSettings();
						await this.display();
					}),
			);

		if (this.plugin.settings.enableModifiedKey === true) {
			new Setting(containerEl)
				.setName("Modified key name")
				.setDesc(
					"Supports nested keys. For example `timethings.updated_at`",
				)
				.addText((text) =>
					text
						.setPlaceholder("updated_at")
						.setValue(this.plugin.settings.modifiedKeyName)
						.onChange(async (value) => {
							this.plugin.settings.modifiedKeyName = value;
							await this.plugin.saveSettings();
						}),
				);

			new Setting(containerEl)
				.setName("Modified key format")
				.setDesc(createLink())
				.addText((text) =>
					text
						.setPlaceholder("YYYY-MM-DD[T]HH:mm:ss.SSSZ")
						.setValue(this.plugin.settings.modifiedKeyFormat)
						.onChange(async (formatter) => {
							// Validate formatter by using it
							const formatTest = moment().format(formatter);
							const valid = moment(formatTest, formatter).isValid();
							if(!valid) {
								text.inputEl.addClass('invalid-format');
							} else {
								text.inputEl.removeClass('invalid-format');
								this.plugin.settings.modifiedKeyFormat = formatter;
								await this.plugin.saveSettings();
							}
						}),
				)

			let thresholdText: TextComponent;
			new Setting(containerEl.createDiv({cls: "textbox"}))
				.setName("Date refresh threshold")
				.setDesc("Active typing duration that must be exceeded in one continuous period for the modification date to be updated.")
				.addSlider((slider) => slider // implicit return without curlies
					.setLimits(0, 60, 1)
					.setValue(this.plugin.settings.modifiedThreshold / 1000)
					.onChange(async (value) => {
						this.plugin.settings.modifiedThreshold = value * 1000;
						thresholdText.setValue(value.toString());
						await this.plugin.saveSettings();
					})
					.setDynamicTooltip(),
				)
				.addText((text) => {
						thresholdText = text
						.setPlaceholder("30")
						.setValue((this.plugin.settings.modifiedThreshold/1000).toString(),)
						.onChange(async (value) => {
							const numericValue = parseInt(value, 10);
							this.plugin.settings.modifiedThreshold = numericValue * 1000;
							mySlider.setValue(numericValue);
							await this.plugin.saveSettings();
						})
				});
		}
		// #endregion

		// Edit duration
		containerEl.createEl("h2", { text: "🔑 Edited duration" });
		containerEl.createEl("p", {
			text: "Track for how long you have been editing a note.",
		});

		new Setting(containerEl)
			.setName("Enable edit duration key")
			.setDesc("")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableEditDurationKey)
					.onChange(async (newValue) => {
						this.plugin.settings.enableEditDurationKey = newValue;
						await this.plugin.saveSettings();
						await this.display();
						// await this.plugin.editDurationBar.toggle(this.plugin.settings.enableEditDurationKey);
					}),
			);

		if (this.plugin.settings.enableEditDurationKey === true) {
			new Setting(containerEl)
				.setName("Edit duration key name")
				.setDesc(
					"Supports nested keys. For example `timethings.edited_seconds`",
				)
				.addText((text) =>
					text
						.setPlaceholder("edited_seconds")
						.setValue(this.plugin.settings.editDurationKeyName)
						.onChange(async (value) => {
							this.plugin.settings.editDurationKeyName = value;
							await this.plugin.saveSettings();
						}),
				);

			new Setting(containerEl)
				.setName("Edited duration key format")
				.setDesc(createLink())
				.addText((text) =>
					text
						.setPlaceholder("HH:mm:ss.SSSZ")
						.setValue(this.plugin.settings.editDurationKeyFormat)
						.onChange(async (formatter) => {
							// Validate formatter by using it
							const formatTest = moment().format(formatter);
							const valid = moment(formatTest, formatter).isValid();
							if(!valid) {
								text.inputEl.addClass('invalid-format');
							} else {
								text.inputEl.removeClass('invalid-format');
								this.plugin.settings.editDurationKeyFormat = formatter;
								await this.plugin.saveSettings();
							}
						}),
				);
			}
		// #endregion


		// #region Danger zone
		containerEl.createEl("h1", { text: "Danger zone" });
		containerEl.createEl("p", { text: "You've been warned!" });

		new Setting(containerEl)
			.setName("Reset settings")
			.setDesc("Resets settings to default")
			.addButton((btn) =>
				btn
					.setIcon("switch")
					.setButtonText("Reset settings")
					.setTooltip("Reset settings")
					.onClick(() => {
						this.plugin.settings = Object.assign(
							{},
							DEFAULT_SETTINGS,
							this.plugin.loadData(),
						);
						this.display();
					}),
			);
		// #endregion
	}
}
