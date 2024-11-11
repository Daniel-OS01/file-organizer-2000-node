import { WorkspaceLeaf } from "obsidian";
import FileOrganizer from "../index";
import { ORGANIZER_VIEW_TYPE, AssistantViewWrapper } from "../views/organizer/view";
import { AIChatView, CHAT_VIEW_TYPE } from "../views/ai-chat/view";
import { Inbox } from "../inbox";

export function initializeChat(plugin: FileOrganizer) {
  plugin.registerView(
    CHAT_VIEW_TYPE,
    (leaf: WorkspaceLeaf) => new AIChatView(leaf, plugin)
  );

  plugin.addRibbonIcon("bot", "Fo2k Chat", () => {
    plugin.showAIChatView();
  });

  plugin.addCommand({
    id: "show-ai-chat",
    name: "Show AI Chat",
    callback: async () => {
      await plugin.showAIChatView();
    },
  });
}

export function initializeOrganizer(plugin: FileOrganizer) {

  plugin.registerView(
    ORGANIZER_VIEW_TYPE,
    (leaf: WorkspaceLeaf) => new AssistantViewWrapper(leaf, plugin)
  );

  plugin.addRibbonIcon("sparkle", "Fo2k Assistant View", () => {
    plugin.showAssistantSidebar();
  });

  plugin.addCommand({
    id: "show-assistant",
    name: "Show Assistant",
    callback: async () => {
      await plugin.showAssistantSidebar();
    },
  });
}

export function initializeFileOrganizationCommands(plugin: FileOrganizer) {


  plugin.addCommand({
    id: "add-to-inbox",
    name: "Put in inbox",
    callback: async () => {
      const activeFile = plugin.app.workspace.getActiveFile();
      // move to file to inbox
      if (activeFile) {
        await plugin.app.vault.rename(activeFile, `${plugin.settings.pathToWatch}/${activeFile.name}`);
      }
    },
  });

  plugin.addCommand({
    id: "organize-text-file",
    name: "Organize text file",
    callback: async () => {
      const activeFile = plugin.app.workspace.getActiveFile();
      if (activeFile) {
        const fileContent = await plugin.getTextFromFile(activeFile);
        await plugin.organizeFile(activeFile, fileContent);
      }
    },
  });
}
