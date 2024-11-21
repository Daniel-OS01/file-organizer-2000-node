import React from "react";
import { SelectedItem } from "../selected-item";
import { ContextItemType, useContextItems } from "../use-context-items";
import { usePlugin } from "../../organizer/provider";
import { TFile, TFolder } from "obsidian";

export const ContextItems: React.FC = () => {
  const plugin = usePlugin();
  const app = plugin.app;

  const {
    currentFile,
    includeCurrentFile,
    files,
    folders,
    youtubeVideos,
    tags,
    screenpipe,
    removeItem,
    toggleCurrentFile,
  } = useContextItems();

  const prefixMap = {
    file: "📄",
    folder: "📁",
    tag: "🏷️",
    youtube: "🎥",
    screenpipe: "📊",
  } as const;

  const handleItemClick = (
    type: ContextItemType,
    id: string,
    title: string
  ) => {
    switch (type) {
      case "file":
        handleOpenFile(title);
        break;
      case "folder":
        handleOpenFolder(title);
        break;
      case "youtube":
        const videoId = id.replace("youtube-", "");
        window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank");
        break;
      case "tag":
        handleOpenTag(title);
        break;
      case "screenpipe":
        // Add screenpipe handling if needed
        break;
    }
  };

  const handleOpenFile = async (fileTitle: string) => {
    const file = app.vault.getFiles().find(f => f.basename === fileTitle);
    if (file) {
      await app.workspace.openLinkText(file.path, "", true);
    }
  };


  const handleOpenFolder = (folderPath: string) => {
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (folder && folder instanceof TFolder) {
      const fileExplorerLeaf =
        app.workspace.getLeavesOfType("file-explorer")[0];
      if (fileExplorerLeaf) {
        app.workspace.revealLeaf(fileExplorerLeaf);
        app.workspace.setActiveLeaf(fileExplorerLeaf);
        const fileExplorer = fileExplorerLeaf.view as any;
        if (fileExplorer?.expandFolder) {
          fileExplorer.expandFolder(folder);
        }
      }
    }
  };

  return (
    <div className="flex-grow overflow-x-auto">
      <div className="flex flex-col space-y-2">
        {/* Current file section */}
        {currentFile && includeCurrentFile && (
          <div className="flex space-x-2">
            <SelectedItem
              key="current-file"
              item={currentFile.title}
              onClick={() =>
                handleItemClick("file", currentFile.id, currentFile.title)
              }
              onRemove={toggleCurrentFile}
              prefix={`${prefixMap.file} `}
            />
          </div>
        )}

        {/* Files section */}
        {Object.values(files).length > 0 && (
          <div className="flex space-x-2">
            {Object.values(files).map(file => (
              <SelectedItem
                key={file.id}
                item={file.title}
                onClick={() => handleItemClick("file", file.id, file.title)}
                onRemove={() => removeItem("file", file.id)}
                prefix={`${prefixMap.file} `}
              />
            ))}
          </div>
        )}

        {/* Folders section */}
        {Object.values(folders).length > 0 && (
          <div className="flex space-x-2">
            {Object.values(folders).map(folder => (
              <SelectedItem
                key={folder.id}
                item={folder.name}
                onClick={() =>
                  handleItemClick("folder", folder.id, folder.name)
                }
                onRemove={() => removeItem("folder", folder.id)}
                prefix={`${prefixMap.folder} `}
              />
            ))}
          </div>
        )}

        {/* Tags section */}
        {Object.values(tags).length > 0 && (
          <div className="flex space-x-2">
            {Object.values(tags).map(tag => (
              <SelectedItem
                key={tag.id}
                item={tag.name}
                onClick={() => handleItemClick("tag", tag.id, tag.name)}
                onRemove={() => removeItem("tag", tag.id)}
                prefix={`${prefixMap.tag} `}
              />
            ))}
          </div>
        )}

        {/* Media section (YouTube and Screenpipe) */}
        {(Object.values(youtubeVideos).length > 0 ||
          Object.values(screenpipe).length > 0) && (
          <div className="flex space-x-2">
            {/* YouTube items */}
            {Object.values(youtubeVideos).map(video => (
              <SelectedItem
                key={video.id}
                item={video.title}
                onClick={() =>
                  handleItemClick("youtube", video.id, video.title)
                }
                onRemove={() => removeItem("youtube", video.id)}
                prefix={`${prefixMap.youtube} `}
              />
            ))}
            {/* Screenpipe items */}
            {Object.values(screenpipe).map(item => (
              <SelectedItem
                key={item.id}
                item={item.reference}
                onClick={() =>
                  handleItemClick("screenpipe", item.id, item.reference)
                }
                onRemove={() => removeItem("screenpipe", item.id)}
                prefix={`${prefixMap.screenpipe} `}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
