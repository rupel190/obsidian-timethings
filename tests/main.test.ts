module.exports = {
	// ...
	preset: 'jest-environment-obsidian',
};

import {
	Editor,
	MarkdownView,
	WorkspaceLeaf,
	Plugin,
	TFile,
	debounce,
	moment
} from "obsidian";

import TimeThings from "src/main";
import { describe } from "node:test";

jest.mock(TimeThings, () => {
    return {
      TimeThings: jest.fn().mockImplementation(() => {
        return {
          startTime: 1000,
        };
      })
    };
  });

describe("my first testes, multiple at once", () => {
    test("check if validate thingy works", () => {
        const mock = new TimeThings();
        const result = validEditDuration(duration);
        expect(result).toBe(true);
    });
    test("check if validate thingy works another time", () => {
        console.log("none");
    });
});





