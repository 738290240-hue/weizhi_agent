# Weizhi Agent

Weizhi Agent is a full-stack, AI-powered workspace designed to integrate multiple large language models and multi-modal tools into a unified, web-based interface. It serves as a powerful workbench for interacting with AI for conversational chat, image generation, and text-to-speech (TTS) synthesis.

The project is built with a modern tech stack, featuring a Spring Boot 3 backend and a Vue 3 frontend.

## ✨ Features

- **Dual AI Provider Support**: Seamlessly switch between **MiniMax** and **DeepSeek** for different tasks.
- **Multi-modal Capabilities**:
    - **Conversational Chat**: Engage in multi-turn conversations with context memory.
    - **Text-to-Image Generation**: Create images from text prompts using the MiniMax model.
    - **Text-to-Speech (TTS)**: Synthesize high-quality audio from text with a wide selection of voices.
- **Unified Web Interface**: A clean, organized, and feature-rich workspace built with Vue 3 and Vite.
- **History & Asset Management**: Browse, preview, and manage all your generated images and audio files.
- **Dynamic Configuration**: Configure API keys and select models for each provider through the UI without restarting the application.
- **System Diagnostics**: Monitor system health, API status, and task queues.

## 🛠️ Tech Stack

- **Backend**:
    - Java 21
    - Spring Boot 3
    - Spring AI
    - Maven
- **Frontend**:
    - Vue 3
    - TypeScript
    - Vite

## 🚀 Getting Started

Follow these instructions to get the project up and running on your local machine.

### Prerequisites

- **JDK 21** or later.
- **Node.js 20** or later.
- **Maven** 3.6 or later.

### 1. Backend Setup

The backend server handles all the logic for communicating with the AI models and managing data.

1.  **Navigate to the backend directory**:
    ```bash
    cd backend
    ```

2.  **Configure API Keys**:
    Create a `.env` file in the `backend` directory. You can copy the structure from your existing file. At a minimum, you need to provide the API keys for the services you intend to use:

    ```dotenv
    # .env
    MINIMAX_API_KEY=your_minimax_api_key_here
    DEEPSEEK_API_KEY=your_deepseek_api_key_here
    ```

3.  **Run the application**:
    Use the Maven wrapper to start the Spring Boot application.

    ```bash
    ./mvnw spring-boot:run
    ```
    The backend server will start on `http://localhost:3007`.

### 2. Frontend Setup

The frontend provides the web-based user interface for the agent.

1.  **Navigate to the frontend directory**:
    ```bash
    cd frontend
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Run the development server**:
    ```bash
    npm run dev
    ```
    The frontend development server will start, typically on `http://localhost:5173`. Open this URL in your browser to use the Weizhi Agent workspace.

## ⚙️ Configuration

- **API Keys**: The primary method for configuring API keys is the `.env` file in the `backend` directory. The application uses these keys to authenticate with the MiniMax and DeepSeek APIs.
- **Models & Endpoints**: Most model IDs and API endpoints are configurable within the `backend/src/main/resources/application.yml` file. You can also adjust settings like server port and storage paths there.
- **In-App Settings**: Some settings, like the currently active model for each provider, can be changed directly from the "Model Settings" page in the web UI.

## 🗺️ Roadmap

This project is actively evolving. Here are some of the planned features to enhance its capabilities as a true AI agent:

- **True Function Calling**: Complete the refactoring to use Spring AI's native function calling, allowing the model to autonomously decide which tools (e.g., image generation, web search) to use.
- **RAG & Knowledge Base**: Implement Retrieval-Augmented Generation (RAG) to allow users to upload documents (PDFs, Markdown) and have the agent answer questions based on their content.
- **Web Search Tool**: Integrate a web search tool (e.g., Google Search, Tavily) to give the agent access to real-time information.
- **Long-term Memory**: Develop a persistent memory system for the agent to remember key facts and user preferences across sessions.
- **Real-time Streaming (SSE)**: Implement true Server-Sent Events for a "typewriter" effect in chat responses, improving user experience.
