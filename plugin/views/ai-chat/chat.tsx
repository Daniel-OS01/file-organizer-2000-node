import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useChat, UseChatOptions } from "@ai-sdk/react";
import { getEncoding } from "js-tiktoken";
import { TFolder, TFile, moment, App } from "obsidian";
import { motion } from "framer-motion";
import { sanitizeTag } from "../../../utils";

import FileOrganizer from "../..";
import Tiptap from "./tiptap";
import { ToolInvocation } from "ai";
import { Button } from "./button";
import { Avatar } from "./avatar";
import { AIMarkdown } from "./ai-message-renderer";
import { UserMarkdown } from "./user-message-renderer";
import { usePlugin } from "./provider";
import ToolInvocationHandler from "./tool-invocation-handler";
import {
  getYouTubeTranscript,
  getYouTubeVideoTitle,
} from "./youtube-transcript";
import { logMessage } from "../../../utils";
import { summarizeMeeting, getDailyInformation } from "./screenpipe-utils";

interface ChatComponentProps {
  plugin: FileOrganizer;
  fileContent: string;
  fileName: string | null;
  apiKey: string;
  inputRef: React.RefObject<HTMLDivElement>;
  history: { id: string; role: string; content: string }[];
  setHistory: (
    newHistory: { id: string; role: string; content: string }[]
  ) => void;
}

const filterNotesByDateRange = async (
  startDate: string,
  endDate: string,
  plugin: FileOrganizer
) => {
  logMessage(startDate, endDate, "startDate, endDate");
  const files = plugin.getAllUserMarkdownFiles();
  logMessage(files.length, "total files");

  const start = moment(startDate).startOf("day");
  const end = moment(endDate).endOf("day");

  const filteredFiles = files.filter(file => {
    // Get the file's modification date
    const fileDate = moment(file.stat.mtime);

    // Check if the file's date is within the specified range
    const isWithinDateRange = fileDate.isBetween(start, end, null, "[]");

    // Check if the file is in the logs folder
    const isInLogsFolder = file.path.startsWith(plugin.settings.logFolderPath);
    const isInTemplatesFolder = file.path.startsWith(
      plugin.settings.templatePaths
    );
    const isInBackupsFolder = file.path.startsWith(
      plugin.settings.backupFolderPath
    );

    logMessage(
      `File: ${file.basename}, ` +
        `Date: ${fileDate.format("YYYY-MM-DD")}, ` +
        `In Date Range: ${isWithinDateRange}, ` +
        `Not in Logs Folder: ${!isInLogsFolder}`
    );

    // Include the file if it's within the date range  + not in the logs folder + not in the templates folder + not in the backups folder
    return (
      isWithinDateRange &&
      !isInLogsFolder &&
      !isInTemplatesFolder &&
      !isInBackupsFolder
    );
  });

  logMessage(filteredFiles.length, "filteredFiles");

  const fileContents = await Promise.all(
    filteredFiles.map(async file => ({
      title: file.basename,
      content: await app.vault.read(file),
      path: file.path,
    }))
  );

  return fileContents;
};

const SelectedItem = ({
  item,
  onRemove,
  prefix = "",
  onClick,
}: {
  item: string;
  onRemove: () => void;
  prefix?: string;
  onClick: () => void;
}) => (
  <motion.div
    className="bg-[--background-secondary] text-[--text-normal] rounded px-2 py-1 text-sm m-1 flex gap-1"
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.8 }}
    transition={{ duration: 0.2 }}
  >
    <span
      onClick={onClick}
      className="cursor-pointer hover:text-[--text-on-accent]"
    >
      {prefix}
      {sanitizeTag(item)}
    </span>
    <div
      onClick={onRemove}
      className="text-[--text-muted] hover:text-[--text-normal] cursor-pointer"
    >
      ×
    </div>
  </motion.div>
);

export const ChatComponent: React.FC<ChatComponentProps> = ({
  fileContent,
  fileName,
  apiKey,
  inputRef,
  history,
  setHistory,
}) => {
  const plugin = usePlugin();
  const app = plugin.app;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<
    { title: string; content: string; reference: string; path: string }[]
  >([]);
  const [allFiles, setAllFiles] = useState<
    { title: string; content: string; path: string }[]
  >([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [allFolders, setAllFolders] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [unifiedContext, setUnifiedContext] = useState<
    { title: string; content: string; path: string; reference: string }[]
  >([]);
  const [selectedYouTubeVideos, setSelectedYouTubeVideos] = useState<
    { videoId: string; title: string; transcript: string }[]
  >([]);
  const [contextSize, setContextSize] = useState(0);
  const [maxContextSize, setMaxContextSize] = useState(80 * 1000); // Default to GPT-3.5-turbo
  const [screenpipeContext, setScreenpipeContext] = useState<any>(null);

  logMessage(unifiedContext, "unifiedContext");

  // Log all the selected stuff
  useEffect(() => {
    // logMessage(selectedFiles, "selectedFiles");
    logMessage(selectedTags, "selectedTags");
    logMessage(selectedFolders, "selectedFolders");
    logMessage(selectedYouTubeVideos, "selectedYouTubeVideos");
  }, [selectedFiles, selectedTags, selectedFolders, selectedYouTubeVideos]);

  const searchNotes = async (query: string) => {
    const files = plugin.getAllUserMarkdownFiles();
    const searchTerms = query.toLowerCase().split(/\s+/);

    const searchResults = await Promise.all(
      files.map(async file => {
        const content = await plugin.app.vault.read(file);
        const lowerContent = content.toLowerCase();

        // Check if all search terms are present in the content
        const allTermsPresent = searchTerms.every(term => {
          const regex = new RegExp(`(^|\\W)${term}(\\W|$)`, "i");
          return regex.test(lowerContent);
        });

        if (allTermsPresent) {
          return {
            title: file.basename,
            content: content,
            reference: `Search query: ${query}`,
            path: file.path,
          };
        }
        return null;
      })
    );
    // Filter out null results
    const filteredResults = searchResults.filter(result => result !== null);
    //
    if (filteredResults.length === 0) {
      logMessage("No files returned");
    }

    return filteredResults;
  };

  const getLastModifiedFiles = async (count: number) => {
    const files = plugin.getAllUserMarkdownFiles();
    const sortedFiles = files.sort((a, b) => b.stat.mtime - a.stat.mtime);
    const lastModifiedFiles = sortedFiles.slice(0, count);

    const fileContents = await Promise.all(
      lastModifiedFiles.map(async file => ({
        title: file.basename,
        content: await plugin.app.vault.read(file),
        path: file.path,
      }))
    );

    return fileContents; // Make sure to stringify the result
  };

  const handleScreenpipeAction = async (toolCall: any) => {
    if (!plugin.settings.enableScreenpipe) {
      return "Screenpipe integration is not enabled. Please enable it in the plugin settings.";
    }

    switch (toolCall.toolName) {
      case "summarizeMeeting":
        const { duration } = toolCall.args as { duration: number };
        try {
          const result = await summarizeMeeting(duration);
          setScreenpipeContext(result);
          return JSON.stringify(result);
        } catch (error) {
          console.error("Error summarizing meeting:", error);
          return JSON.stringify({ error: error.message });
        }
      case "getDailyInformation":
        const { date } = toolCall.args as { date?: string };
        try {
          const result = await getDailyInformation(date);
          setScreenpipeContext(result);
          return JSON.stringify(result);
        } catch (error) {
          console.error("Error getting daily information:", error);
          return JSON.stringify({ error: error.message });
        }
      default:
        return "Unknown Screenpipe action";
    }
  };

  // Create a memoized body object that updates when its dependencies change
  const chatBody = useMemo(
    () => ({
      unifiedContext,
      enableScreenpipe: plugin.settings.enableScreenpipe,
      currentDatetime: moment().format("YYYY-MM-DDTHH:mm:ssZ"),
    }),
    [unifiedContext, plugin.settings.enableScreenpipe]
  );

  const {
    isLoading: isGenerating,
    messages,
    input,
    handleInputChange,
    handleSubmit,
    stop,
    addToolResult,
  } = useChat({
    api: `${plugin.getServerUrl()}/api/chat`,
    body: chatBody,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    keepLastMessageOnError: true,
    maxSteps: 1,
    onError: error => {
      console.error(error);
      setErrorMessage(
        "Connection failed. If the problem persists, please check your internet connection or VPN."
      );
    },
    onFinish: () => {
      setErrorMessage(null);
    },

    async onToolCall({ toolCall }) {
      logMessage(toolCall, "toolCall");
      if (toolCall.toolName === "getYouTubeTranscript") {
        const args = toolCall.args as { videoId: string };
        const { videoId } = args;
        try {
          const transcript = await getYouTubeTranscript(videoId);
          const title = await getYouTubeVideoTitle(videoId);
          setSelectedYouTubeVideos(prev => [
            ...prev,

            { videoId, title, transcript },
          ]);
          logMessage(transcript, "transcript");
          addToolResult({
            toolCallId: toolCall.toolCallId,
            result: { transcript, title, videoId },
          });
          return { transcript, title, videoId };
        } catch (error) {
          console.error("Error fetching YouTube transcript:", error);
          return JSON.stringify({ error: error.message });
        }
      } else if (toolCall.toolName === "getNotesForDateRange") {
        const args = toolCall.args as { startDate: string; endDate: string };
        const { startDate, endDate } = args;
        logMessage(startDate, endDate, "startDate, endDate");
        const filteredNotes = await filterNotesByDateRange(
          startDate,
          endDate,
          plugin
        );

        // Add filtered Markdown notes to selectedFiles
        setSelectedFiles(prevFiles => {
          const newFiles = filteredNotes
            .map(note => ({
              title: note.title,
              content: note.content,
              reference: `Date range: ${startDate} to ${endDate}`,
              path: note.path,
            }))
            .filter(
              file => !prevFiles.some(prevFile => prevFile.path === file.path)
            );
          return [...prevFiles, ...newFiles];
        });

        // Return a message about the fetched notes
        return `Fetched ${filteredNotes.length} notes for the date range: ${startDate} to ${endDate}`;
      } else if (toolCall.toolName === "searchNotes") {
        const args = toolCall.args as { query: string };
        const { query } = args;
        const searchResults = await searchNotes(query);

        // Add search results to selectedFiles
        setSelectedFiles(prevFiles => {
          const newFiles = searchResults.filter(
            file => !prevFiles.some(prevFile => prevFile.path === file.path)
          );
          return [...prevFiles, ...newFiles];
        });

        // Pass search results to the tool invocation handler
        toolCall.results = searchResults;
        logMessage(searchResults, "searchResults");
        return JSON.stringify(searchResults);
      } else if (toolCall.toolName === "modifyCurrentNote") {
        const args = toolCall.args as { formattingInstruction: string };
        const { formattingInstruction } = args;
        const activeFile = plugin.app.workspace.getActiveFile();
        if (activeFile) {
          try {
            const currentContent = await plugin.app.vault.read(activeFile);
            await plugin.formatContent(
              activeFile,
              currentContent,
              formattingInstruction
            );
            return `Successfully modified the current note "${activeFile.basename}" using the formatting instruction.`;
          } catch (error) {
            console.error("Error modifying note:", error);
            return "Failed to modify the current note.";
          }
        } else {
          return "No active file found.";
        }
      } else if (toolCall.toolName === "getLastModifiedFiles") {
        const args = toolCall.args as { count: number };
        const { count } = args;
        const lastModifiedFiles = await getLastModifiedFiles(count);
        logMessage(lastModifiedFiles, "lastModifiedFiles");

        // Add last modified files to selectedFiles
        setSelectedFiles(prevFiles => {
          const newFiles = lastModifiedFiles
            .map(file => ({
              title: file.title,
              content: file.content,
              reference: `Last modified: ${file.title}`,
              path: file.path,
            }))
            .filter(
              file => !prevFiles.some(prevFile => prevFile.path === file.path)
            );
          return [...prevFiles, ...newFiles];
        });
        toolCall.args = {
          count: lastModifiedFiles.length,
          files: lastModifiedFiles,
        };

        return lastModifiedFiles.length.toString();
      } else if (
        ["summarizeMeeting", "getDailyInformation"].includes(toolCall.toolName)
      ) {
        return handleScreenpipeAction(toolCall);
      }
    },
  } as UseChatOptions);

  const formRef = useRef<HTMLFormElement>(null);

  const handleSendMessage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    logMessage(e.target, "target");
    setErrorMessage(null);
    handleSubmit(e);
    setHistory([...history, ...messages]);
  };

  const handleCancelGeneration = () => {
    stop();
  };

  const handleRetry = (lastMessageContent: string) => {
    setErrorMessage(null); // Clear error message on retry
    handleInputChange({
      target: { value: lastMessageContent },
    } as React.ChangeEvent<HTMLInputElement>);

    // Remove the last message
    messages.pop();

    // Programmatically submit the form
    setTimeout(() => {
      if (formRef.current) {
        formRef.current.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
      }
    }, 0);
  };

  const handleRemoveFile = useCallback((filePath: string) => {
    setSelectedFiles(prevFiles =>
      prevFiles.filter(file => file.path !== filePath)
    );
    setUnifiedContext(prevContext =>
      prevContext.filter(file => file.path !== filePath)
    );
  }, []);

  const handleTiptapChange = async (newContent: string) => {
    handleInputChange({
      target: { value: newContent },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event as unknown as React.FormEvent<HTMLFormElement>);
    }
  };

  const handleFileSelect = (
    files: { title: string; content: string; reference: string; path: string }[]
  ) => {
    setSelectedFiles(prevFiles => {
      const newFiles = files.filter(
        file => !prevFiles.some(prevFile => prevFile.path === file.path)
      );
      return [...prevFiles, ...newFiles];
    });
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
      // Reveal the folder in the file explorer
      const fileExplorerLeaf =
        app.workspace.getLeavesOfType("file-explorer")[0];
      if (fileExplorerLeaf) {
        app.workspace.revealLeaf(fileExplorerLeaf);
        // Focus on the folder in the file explorer
        app.workspace.setActiveLeaf(fileExplorerLeaf);
        // Expand the folder in the file explorer
        const fileExplorer = fileExplorerLeaf.view as any;
        if (fileExplorer && typeof fileExplorer.expandFolder === "function") {
          fileExplorer.expandFolder(folder);
        }
      }
    }
  };

  const handleTagSelect = (newTags: string[]) => {
    setSelectedTags(prevTags => {
      const updatedTags = [
        ...new Set([
          ...prevTags,
          ...newTags.map(tag => (tag.startsWith("#") ? tag : `#${tag}`)),
        ]),
      ];
      return updatedTags;
    });
  };

  const handleFolderSelect = async (folders: string[]) => {
    setSelectedFolders(folders);
  };

  useEffect(() => {
    const loadAllFiles = async () => {
      const files = plugin.getAllUserMarkdownFiles();
      const fileData = await Promise.all(
        files.map(async file => ({
          title: file.basename,
          content: await plugin.app.vault.read(file),
          path: file.path,
        }))
      );
      setAllFiles(fileData);
    };

    loadAllFiles();
  }, [plugin.app.vault]);

  useEffect(() => {
    const loadTagsAndFolders = async () => {
      const tags = await plugin.getAllVaultTags();
      setAllTags(tags);

      const folders = plugin.getAllNonFo2kFolders();
      setAllFolders(folders);
    };

    loadTagsAndFolders();
  }, [plugin]);

  const [includeCurrentFile, setIncludeCurrentFile] = useState(true);

  const handleRemoveCurrentFile = () => {
    setIncludeCurrentFile(false);
  };

  const handleAddCurrentFile = () => {
    setIncludeCurrentFile(true);
  };

  useEffect(() => {
    const updateUnifiedContext = async () => {
      const contextFiles = new Map<
        string,
        { title: string; content: string; path: string; reference: string }
      >();

      // Add selected files
      selectedFiles.forEach(file => {
        contextFiles.set(file.path, {
          title: file.title,
          content: file.content,
          path: file.path,
          reference: file.reference || `File: ${file.title}`,
        });
      });

      // Add current file if includeCurrentFile is true
      if (includeCurrentFile && fileName && fileContent) {
        contextFiles.set(fileName, {
          title: fileName,
          content: fileContent,
          path: fileName,
          reference: `Current File: ${fileName}`,
        });
      }

      // Add files with selected tags
      if (selectedTags.length > 0) {
        const filesWithTags = allFiles.filter(file =>
          selectedTags.some(tag => file.content.includes(tag))
        );
        filesWithTags.forEach(file => {
          contextFiles.set(file.path, {
            ...file,
            reference: `Tag: ${selectedTags.join(", ")}`,
          });
        });
      }

      if (selectedFolders.length > 0) {
        const folderContents = await Promise.all(
          selectedFolders.map(async folderPath => {
            const folder = app.vault.getAbstractFileByPath(folderPath);
            if (folder instanceof TFolder) {
              const files = folder.children.filter(
                (file): file is TFile =>
                  file instanceof TFile && file.extension === "md"
              );
              return await Promise.all(
                files.map(async file => ({
                  title: file.basename,
                  content: await app.vault.read(file),
                  path: file.path,
                  reference: `Folder: ${folderPath}`,
                }))
              );
            }
            return [];
          })
        );
        folderContents.flat().forEach(file => {
          contextFiles.set(file.path, file);
        });
      }

      // Add YouTube transcripts
      selectedYouTubeVideos.forEach(video => {
        contextFiles.set(`youtube-${video.videoId}`, {
          title: `YouTube: ${video.title}`,
          content: video.transcript,
          path: `https://www.youtube.com/watch?v=${video.videoId}`,
          reference: `YouTube: ${video.title}`,
        });
      });

      // Add Screenpipe context if available
      if (screenpipeContext) {
        contextFiles.set("screenpipe-context", {
          title: "Screenpipe Data",
          content: JSON.stringify(screenpipeContext),
          path: "screenpipe-context",
          reference: "Screenpipe Query Results",
        });
      }

      // Convert Map to array
      const uniqueFiles = Array.from(contextFiles.values());

      setUnifiedContext(uniqueFiles);
    };

    updateUnifiedContext();
  }, [
    selectedFiles,
    selectedTags,
    selectedFolders,
    allFiles,
    fileName,
    fileContent,
    app.vault,
    includeCurrentFile,
    selectedYouTubeVideos,
    screenpipeContext,
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, history]);

  const handleClearAll = useCallback(() => {
    setSelectedFiles([]);
    setSelectedFolders([]);
    setSelectedTags([]);
    setIncludeCurrentFile(false);
    setUnifiedContext([]);
    setSelectedYouTubeVideos([]);
    setScreenpipeContext(null);
  }, []);

  const handleRemoveYouTubeVideo = (videoId: string) => {
    setSelectedYouTubeVideos(prev =>
      prev.filter(video => video.videoId !== videoId)
    );
  };

  useEffect(() => {
    const calculateContextSize = () => {
      const encoding = getEncoding("o200k_base");

      let totalTokens = 0;
      unifiedContext.forEach(item => {
        totalTokens += encoding.encode(item.content).length;
      });

      setContextSize(totalTokens);
    };

    calculateContextSize();
  }, [unifiedContext]);

  const isContextOverLimit = contextSize > maxContextSize;

  const handleActionButton = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isGenerating) {
      handleCancelGeneration();
    } else {
      handleSendMessage(e);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-screen bg-[--background-primary]">
      <div className="flex-grow overflow-y-auto p-4">
        <div className="flex flex-col min-h-min-content">
          {history.map(message => (
            <div key={message.id} className={`flex items-start mb-4 ${message.role === 'assistant' ? 'bg-[--background-secondary]' : ''} rounded-lg p-2`}>
              <Avatar role={message.role as "user" | "assistant"} />
              <div className="ml-2 p-2 rounded-lg text-[--text-normal]">
                <AIMarkdown content={message.content} />
              </div>
            </div>
          ))}
          {messages.map(message => (
            <div key={message.id} className={`flex items-start mb-4 ${message.role === 'assistant' ? 'bg-[--background-secondary]' : ''} rounded-lg p-2`}>
              <Avatar role={message.role as "user" | "assistant"} />
              <div className="ml-2 p-2 rounded-lg text-[--text-normal]">
                {message.role === "user" ? (
                  <UserMarkdown content={message.content} />
                ) : message.toolInvocations ? (
                  <UserMarkdown content={message.content} />
                ) : (
                  <AIMarkdown content={message.content} />
                )}
                {message.toolInvocations?.map(
                  (toolInvocation: ToolInvocation) => (
                    <ToolInvocationHandler
                      key={toolInvocation.toolCallId}
                      toolInvocation={toolInvocation}
                      addToolResult={addToolResult}
                      results={toolInvocation.results}
                    />
                  )
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-2">
        {contextSize / maxContextSize > 0.75 && (
          <p className="text-sm text-[--text-muted]">
            Context Size: {Math.round((contextSize / maxContextSize) * 100)}%
          </p>
        )}
        {isContextOverLimit && (
          <p className="text-sm text-[--text-error]">Warning: Context size exceeds maximum!</p>
        )}
      </div>

      {errorMessage && (
        <div className="bg-[--background-modifier-error] border border-[--text-error] text-[--text-error] px-4 py-3 rounded relative mb-4">
          {errorMessage}
          <Button
            type="button"
            onClick={() => handleRetry(messages[messages.length - 1].content)}
            className="ml-4 bg-[--interactive-accent] hover:bg-[--interactive-accent-hover] text-[--text-on-accent] font-bold py-2 px-4 rounded"
          >
            Retry
          </Button>
        </div>
      )}

      <div className="mt-4 p-4">
        <div className="bg-[--background-secondary] rounded-lg px-2 pt-1 pb-3 mb-2 ">
          <div>
            <h6 className="text-xs font-semibold text-[--text-normal] ">Context</h6>
            <div className="flex flex-wrap">
              {fileName && includeCurrentFile && (
                <SelectedItem
                  key="current-file"
                  item={fileName}
                  onClick={() => handleOpenFile(fileName)}
                  onRemove={handleRemoveCurrentFile}
                  prefix="📄 "
                />
              )}
              {selectedFiles.map((file, index) => (
                <SelectedItem
                  key={`${file.path}-${index}`}
                  item={file.title}
                  onClick={() => handleOpenFile(file.title)}
                  onRemove={() => handleRemoveFile(file.path)}
                  prefix=" "
                />
              ))}
              {selectedFolders.map((folder, index) => (
                <SelectedItem
                  key={`${folder}-${index}`}
                  item={folder}
                  onClick={() => handleOpenFolder(folder)}
                  onRemove={() =>
                    setSelectedFolders(folders =>
                      folders.filter(f => f !== folder)
                    )
                  }
                  prefix="📁 "
                />
              ))}
              {selectedTags.map((tag, index) => (
                <SelectedItem
                  key={`${tag}-${index}`}
                  item={tag}
                  onClick={() => {
                    /* Handle tag click */
                  }}
                  onRemove={() =>
                    setSelectedTags(tags => tags.filter(t => t !== tag))
                  }
                  prefix="🏷️ "
                />
              ))}
              {selectedYouTubeVideos.map(video => (
                <SelectedItem
                  key={`youtube-${video.videoId}`}
                  item={video.title}
                  onClick={() =>
                    window.open(
                      `https://www.youtube.com/watch?v=${video.videoId}`,
                      "_blank"
                    )
                  }
                  onRemove={() => handleRemoveYouTubeVideo(video.videoId)}
                  prefix="🎥 "
                />
              ))}
              {screenpipeContext && (
                <SelectedItem
                  key="screenpipe-context"
                  item="Screenpipe Data"
                  onClick={() => {
                    /* You can add an action here if needed */
                  }}
                  onRemove={() => setScreenpipeContext(null)}
                  prefix="📊 "
                />
              )}
            </div>

            <div className="mt-2">
              {fileName && !includeCurrentFile && (
                <Button
                  onClick={handleAddCurrentFile}
                  className="mr-2 bg-[--interactive-accent] hover:bg-[--interactive-accent-hover] text-[--text-on-accent] font-bold py-2 px-4 rounded"
                >
                  Add Current File to Context
                </Button>
              )}
              {(selectedFiles.length > 0 ||
                selectedFolders.length > 0 ||
                selectedTags.length > 0 ||
                includeCurrentFile ||
                selectedYouTubeVideos.length > 0 ||
                screenpipeContext) && (
                <Button onClick={handleClearAll} className="hover:bg-[--text-error-hover] text-[--text-on-accent] font-bold py-2 px-4 rounded">
                  Clear All Context
                </Button>
              )}
            </div>
          </div>
        </div>

        <form
          ref={formRef}
          onSubmit={handleActionButton}
          className="flex items-end"
        >
          <div className="flex-grow max-h-40 overflow-y-auto" ref={inputRef}>
            <Tiptap
              value={input}
              onChange={handleTiptapChange}
              onKeyDown={handleKeyDown}
              files={allFiles}
              tags={allTags}
              folders={allFolders}
              onFileSelect={handleFileSelect}
              onTagSelect={handleTagSelect}
              onFolderSelect={handleFolderSelect}
              currentFileName={fileName || ""}
              currentFileContent={fileContent}
            />
          </div>
          <Button
            type="submit"
            className={`h-full ml-2 font-bold py-2 px-4 rounded ${
              isGenerating
                ? "bg-[--text-warning] hover:bg-[--text-warning-hover]"
                : "bg-[--interactive-accent] hover:bg-[--interactive-accent-hover]"
            } text-[--text-on-accent]`}
            disabled={isContextOverLimit}
          >
            {isGenerating ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            )}
          </Button>
        </form>
        <div className="mt-2 text-sm text-[--text-muted] p-4">
          <div className="mb-1">
            <span className="font-bold">Tip 1️⃣</span>
            <span className="ml-2">
              To add more files to the AI context, mention them in the chat
              using the format @filename
            </span>
          </div>
          <div>
            <span className="font-bold">Tip 2️⃣</span>
            <span className="ml-2">
              Or use prompts like "get notes from this week" or "get YouTube
              transcript", then follow up with your question (e.g. "summarize my
              notes/transcript") in a separate message
            </span>
          </div>
        </div>
      </div>

      {isContextOverLimit && (
        <div className="mt-2 p-2 bg-[--background-modifier-error] border border-[--text-error] text-[--text-error] rounded">
          Context size exceeds maximum. Please remove some context to continue.
        </div>
      )}
    </div>
  );
};
