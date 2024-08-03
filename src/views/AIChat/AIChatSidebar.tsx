import React, { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "ai/react";

import FileOrganizer from "../..";
import ReactMarkdown from "react-markdown";
import Tiptap from "../components/TipTap";
import { debounce } from "obsidian";

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ children, ...props }) => (
  <button {...props} className={`button ${props.className || ""}`}>
    {children}
  </button>
);

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  ...props
}) => (
  <div {...props} className={`card ${props.className || ""}`}>
    {children}
  </div>
);

export const Avatar: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { role: "user" | "assistant" }
> = ({ role, ...props }) => (
  <div {...props} className={`avatar ${role} ${props.className || ""}`}></div>
);

interface ChatComponentProps {
  plugin: FileOrganizer;
  fileContent: string;
  fileName: string | null;
  apiKey: string;
  inputRef: React.RefObject<HTMLDivElement>;
}

const ChatComponent: React.FC<ChatComponentProps> = ({
  plugin,
  fileContent,
  fileName,
  apiKey,
  inputRef,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [context, setContext] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<{ title: string; content: string }[]>([]);
  const [allFiles, setAllFiles] = useState<{ title: string; content: string }[]>([]);
  console.log(selectedFiles, "selectedFiles");

  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: `${plugin.getServerUrl()}/api/chat`,
    body: { fileContent, fileName, context, selectedFiles },
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    keepLastMessageOnError: true,
    onError: error => {
      console.error(error);
      setErrorMessage(
        "Connection failed. If the problem persists, please check your internet connection or VPN."
      );
    },
    onFinish: () => {
      setErrorMessage(null); // Clear error message when a message is successfully sent
    },
  });

  const formRef = useRef<HTMLFormElement>(null);

  const handleSendMessage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log(e.target, "target");
    setErrorMessage(null); // Clear error message on new submit
    handleSubmit(e);
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

  // const debouncedSetContext = useRef(
  //   debounce(async (newContent: string) => {
  //     if (newContent.includes("@screenpipe")) {
  //       const query = newContent.split("@screenpipe")[1].trim();
  //       console.log(query, "query");
  //       try {
  //         // Extract keyword
  //         const keywordsResponse = await fetch(
  //           `${plugin.getServerUrl()}/api/keywords`,
  //           {
  //             method: "POST",
  //             headers: {
  //               "Content-Type": "application/json",
  //               Authorization: `Bearer ${apiKey}`,
  //             },
  //             body: JSON.stringify({ query }),
  //           }
  //         );
  //         const keywordsData = await keywordsResponse.json();
  //         console.log(keywordsData, "keywordsData");

  //         const keyword = keywordsData.keyword;

  //         // Now use this keyword for the search
  //         const searchResponse = await fetch(
  //           `http://localhost:3030/search?q=${encodeURIComponent(keyword)}&limit=5`
  //         );
  //         const searchData = await searchResponse.json();
  //         console.log(searchData, "searchData");
  //         setContext(
  //           `Context about query "${query}": ${JSON.stringify(searchData)}`
  //         );
  //       } catch (error) {
  //         console.error("Error processing query:", error);
  //       }
  //     }
  //   }, 1000)
  // ).current;

  // const handleSetContext = (newContent: string) => {
  //   debouncedSetContext(newContent);
  // };

  const handleTiptapChange = async (newContent: string) => {
    // handleSetContext(newContent);

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

  useEffect(() => {
    const loadAllFiles = async () => {
      const files = plugin.app.vault.getFiles();
      const fileData = await Promise.all(
        files.map(async (file) => ({
          title: file.basename,
          content: await plugin.app.vault.read(file),
        }))
      );
      setAllFiles(fileData);
    };

    loadAllFiles();
  }, [plugin.app.vault]);

  useEffect(() => {
    const newContext = selectedFiles.map(file => `File: ${file.title}\n\nContent:\n${file.content}`).join('\n\n');
    setContext(newContext);
  }, [selectedFiles]);

  const handleFileSelect = (files: { title: string; content: string }[]) => {
    console.log(files, "files");
    setSelectedFiles(files);
  };

  return (
    <>
      <div className="chat-messages">
        {messages.map(message => (
          <div key={message.id} className={`message ${message.role}-message`}>
            <Avatar role={message.role as "user" | "assistant"} />
            <div className="message-content">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
      <form
        ref={formRef}
        onSubmit={handleSendMessage}
        className="chat-input-form"
      >
        <div className="tiptap-wrapper" ref={inputRef}>
          <Tiptap
            value={input}
            onChange={handleTiptapChange}
            onKeyDown={handleKeyDown}
            files={allFiles}
            onFileSelect={handleFileSelect}
          />
        </div>
        <Button type="submit" className="send-button">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ width: "20px", height: "20px" }} // Inline styles to make the icon smaller
          >
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </Button>
      </form>
      {errorMessage && (
        <div className="error-message">
          {errorMessage}
          <Button
            type="button"
            onClick={() => handleRetry(messages[messages.length - 1].content)}
            className="retry-button"
          >
            Retry
          </Button>
        </div>
      )}
    </>
  );
};

interface AIChatSidebarProps {
  plugin: FileOrganizer;
  apiKey: string;
}

const AIChatSidebar: React.FC<AIChatSidebarProps> = ({ plugin, apiKey }) => {
  const [fileContent, setFileContent] = useState<string>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const inputRef = useRef<HTMLDivElement>(null);




  const startNewConversation = useCallback(() => {
    setKey(prevKey => prevKey + 1);
    // Use setTimeout to ensure the new ChatComponent has mounted
    setTimeout(() => {
      if (inputRef.current) {
        const tiptapElement = inputRef.current.querySelector('.ProseMirror');
        if (tiptapElement) {
          (tiptapElement as HTMLElement).focus();
        }
      }
    }, 0);
  }, []);

  useEffect(() => {
    const loadFileContent = async () => {
      const activeFile = plugin.app.workspace.getActiveFile();
      if (activeFile) {
        try {
          const content = await plugin.app.vault.read(activeFile);
          setFileContent(content);
          setFileName(activeFile.name);
        } catch (error) {
          console.error(`Error reading file: ${error}`);
          setFileContent("");
          setFileName(null);
        }
      } else {
        setFileContent("");
        setFileName(null);
      }
      setKey(prevKey => prevKey + 1);
    };

    loadFileContent();

    // Set up event listener for file changes
    const onFileOpen = plugin.app.workspace.on("file-open", loadFileContent);

    return () => {
      plugin.app.workspace.offref(onFileOpen);
    };
  }, [plugin.app.workspace, plugin.app.vault]);

  return (
    <Card className="ai-chat-sidebar">
      <div className="new-conversation-container">
        <Button onClick={startNewConversation} className="new-conversation-button" aria-label="New Conversation">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Button>
      </div>
      <ChatComponent
        key={key}
        plugin={plugin}
        fileContent={fileContent}
        fileName={fileName}
        apiKey={apiKey}
        inputRef={inputRef}
      />
    </Card>
  );
};

export default AIChatSidebar;