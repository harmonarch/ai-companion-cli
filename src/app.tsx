/**
 * 顶层 Ink 应用组件。
 * 这里负责把服务初始化、UI reducer、overlay、聊天列表和输入框拼成一个完整终端界面。
 * 新人读这个文件时，重点看服务创建、bootstrap、输入提交和各个 overlay hook 的协作关系。
 */
import React, { useCallback, useEffect, useReducer, useState } from "react";
import { Box, Text, useApp } from "ink";
import pc from "picocolors";
import { createAppServices } from "#src/app/create-app-services.js";
import { applyModelSelection } from "#src/app/handle-app-command.js";
import { useAppBootstrap } from "#src/app/use-app-bootstrap.js";
import { useAppInput } from "#src/app/use-app-input.js";
import { useMemoryOverlaySync } from "#src/app/use-memory-overlay-sync.js";
import { usePromptHistory } from "#src/app/use-prompt-history.js";
import { useSubmitHandler } from "#src/app/use-submit-handler.js";
import {
  getActiveConfirmation,
  getMemoryOverlay,
  getModelOverlay,
  getPromptInputDisabledReason,
  getSessionsOverlay,
  getStatusMode,
  initialUiState,
  isPanelVisible,
  isPromptDisabled,
  uiReducer,
} from "#src/app/ui-state.js";
import { ChatList } from "#src/components/ChatList.js";
import { HelpList } from "#src/components/HelpList.js";
import { HorizontalDivider } from "#src/components/HorizontalDivider.js";
import { MemoryList } from "#src/components/MemoryList.js";
import { ModelList } from "#src/components/ModelList.js";
import { PromptInput } from "#src/components/PromptInput.js";
import { SessionList } from "#src/components/SessionList.js";
import { StatusBar } from "#src/components/StatusBar.js";
import type { ChatController } from "#src/controller/chat-controller.js";
import type { SessionSnapshot, SessionStore } from "#src/controller/session-store.js";
import type { RuntimeConfigService } from "#src/infra/config/runtime-config-service.js";
import type { AssistantProfileRepository } from "#src/infra/repositories/assistant-profile-repository.js";
import { listProviderCatalog } from "#src/providers/registry.js";
import type { SessionSummary } from "#src/types/session.js";
import { sanitizeSingleLineText } from "#src/utils/sanitize-text.js";

interface AppServices {
  sessionStore: SessionStore | null;
  controller: ChatController | null;
  assistantProfileRepository: AssistantProfileRepository | null;
  runtimeConfig: RuntimeConfigService | null;
  error: string | null;
}

export function App({
  initialSessionId,
  onExitRequested,
}: {
  initialSessionId?: string;
  onExitRequested?: () => void;
}) {
  const { exit } = useApp();
  /**
   * services 保存“启动后只创建一次”的运行时依赖。
   * 它们来自 createAppServices，后续大多数 hook 和渲染逻辑都围绕这些对象展开。
   */
  const [services, setServices] = useState<AppServices>({
    sessionStore: null,
    controller: null,
    assistantProfileRepository: null,
    runtimeConfig: null,
    error: null,
  });
  /**
   * uiState 管理纯 UI 层状态，例如输入框内容、overlay 开关、确认弹窗和状态栏文案。
   * 业务数据本身不放这里，而是通过 snapshot / sessions 承载。
   */
  const [uiState, dispatch] = useReducer(uiReducer, initialUiState);
  /** 当前会话的完整快照，聊天消息、工具执行、memory、emotion 都从这里读。 */
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  /** 左侧 sessions overlay 使用的会话摘要列表。 */
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const sessionStore = services.sessionStore;
  const runtimeConfig = services.runtimeConfig;
  /** 模型列表是静态注册信息，用来渲染 model overlay 和处理模型切换。 */
  const modelCatalog = listProviderCatalog();

  useEffect(() => {
    /**
     * 服务实例只在应用启动时创建一次。
     * 这里把启动失败也转成 UI 可展示状态，避免在 Ink 渲染阶段直接抛出。
     */
    try {
      const nextServices = createAppServices();
      setServices({
        sessionStore: nextServices.sessionStore,
        controller: nextServices.controller,
        assistantProfileRepository: nextServices.assistantProfileRepository,
        runtimeConfig: nextServices.runtimeConfig,
        error: null,
      });

      return () => {
        nextServices.close();
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setServices({
        sessionStore: null,
        controller: null,
        assistantProfileRepository: null,
        runtimeConfig: null,
        error: `Startup error: ${message}`,
      });
      return;
    }
  }, []);

  useAppBootstrap({
    dispatch,
    initialSessionId,
    runtimeConfig,
    sessionStore,
    setSessions,
    setSnapshot,
  });

  /**
   * 这些 selector 把 uiState 中和渲染相关的片段提取出来。
   * 这样 JSX 区域读起来更像“当前该显示什么”，不用反复关心 reducer 的内部结构。
   */
  const activeConfirmation = getActiveConfirmation(uiState);
  const memoryOverlay = getMemoryOverlay(uiState);
  const modelOverlay = getModelOverlay(uiState);
  const sessionsOverlay = getSessionsOverlay(uiState);
  const activeSessionId = snapshot?.session.id ?? null;

  /**
   * memory overlay 展示的是 snapshot 里的 memory 数据。
   * 当会话切换或 memory 发生变化时，这个 hook 负责把 overlay 内部选中态同步回正确位置。
   */
  useMemoryOverlaySync({
    dispatch,
    memoryOverlay,
    snapshot,
  });

  const handleModelSelected = useCallback((option: { providerId: string; model: string }) => {
    if (!runtimeConfig || !sessionStore) {
      return;
    }

    try {
      /**
       * 模型切换属于“改配置 + 改当前会话快照”的组合动作。
       * applyModelSelection 会统一处理持久化、状态更新和 sessions 列表刷新。
       */
      applyModelSelection({
        activeSnapshot: snapshot,
        dispatch,
        option,
        runtimeConfig,
        sessionStore,
        setSnapshot,
        setSessions,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: "status/set", value: `Error: ${message}` });
    }
  }, [runtimeConfig, sessionStore, snapshot]);

  /**
   * useAppInput 处理全局按键输入。
   * 它主要负责 overlay 导航、确认弹窗快捷键、会话切换、模型选择等“非提交型输入”。
   */
  useAppInput({
    activeConfirmation,
    activeSnapshot: snapshot,
    dispatch,
    modelCatalog,
    onModelSelected: handleModelSelected,
    sessionStore,
    sessions,
    setSessions,
    setSnapshot,
    uiState,
  });

  /**
   * 真正的“提交一行输入后发生什么”集中在 useSubmitHandler。
   * 它会识别 slash command、驱动 controller 跑一轮对话，并把结果写回 snapshot / sessions。
   */
  const handleSubmit = useSubmitHandler({
    activeSnapshot: snapshot,
    assistantProfileRepository: services.assistantProfileRepository,
    controller: services.controller,
    dispatch,
    onExitRequested: onExitRequested ?? exit,
    pendingProfileClearConfirmation: uiState.pendingProfileClearConfirmation,
    pendingResetConfirmation: uiState.pendingResetConfirmation,
    runtimeConfig,
    sessionStore,
    setSessions,
    setSnapshot,
    uiState,
  });


  /**
   * Prompt history 只负责输入框层面的历史浏览与提交触发。
   * 真正的命令分流、流式更新和持久化仍然在 useSubmitHandler / controller 里完成。
   */
  const { handleHistoryDown, handleHistoryUp, handlePromptSubmit } = usePromptHistory({
    activeSessionId,
    dispatch,
    input: uiState.input,
    onSubmit: (next) => {
      void handleSubmit(next);
    },
    setupInput: uiState.setupInput,
    setupRequired: runtimeConfig?.getSetupState().setupRequired ?? false,
  });

  if (services.error) {
    return <Text>{sanitizeSingleLineText(services.error, 240)}</Text>;
  }

  /**
   * App 的渲染前提有两层：
   * 1. 运行时服务创建完成；
   * 2. bootstrap 已经拿到当前会话快照。
   * 任一层没准备好时，都先显示状态文案或 Loading。
   */
  if (!services.controller || !services.assistantProfileRepository || !runtimeConfig || !sessionStore) {
    return <Text>{uiState.statusMessage ? sanitizeSingleLineText(uiState.statusMessage, 240) : "Loading..."}</Text>;
  }

  if (!snapshot) {
    return <Text>{uiState.statusMessage ? sanitizeSingleLineText(uiState.statusMessage, 240) : "Loading..."}</Text>;
  }

  const activeSnapshot = snapshot;
  const mode = getStatusMode(uiState);
  const inputDisabledReason = getPromptInputDisabledReason(uiState);
  const assistantLabel = runtimeConfig.getConfig().assistantProfile?.name;

  return (
    <Box flexDirection="column">
      <Box marginTop={1} flexDirection="column">
        {/** 顶部区域按优先级显示：确认提示、各种 overlay、最后才是聊天正文。 */}
        {activeConfirmation ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text>{pc.yellow("confirm")} {pc.white(sanitizeSingleLineText(activeConfirmation.request.toolName, 120))}</Text>
            <Text>{pc.gray(sanitizeSingleLineText(activeConfirmation.request.summary, 240))}</Text>
            <Text>{pc.gray("press y to approve · n or esc to deny")}</Text>
            {uiState.pendingConfirmations.length > 1 ? (
              <Text>{pc.gray(`${uiState.pendingConfirmations.length - 1} more queued`)}</Text>
            ) : null}
          </Box>
        ) : null}
        {uiState.overlay.kind === "help" ? (
          <Box marginBottom={1}>
            <HelpList />
          </Box>
        ) : null}
        {modelOverlay ? (
          <Box marginBottom={1}>
            <ModelList
              options={modelCatalog.flatMap((entry) => entry.models.map((model) => ({
                providerId: entry.providerId,
                model,
              })))}
              selectedIndex={modelOverlay.selectedIndex}
              currentProvider={activeSnapshot.session.provider}
              currentModel={activeSnapshot.session.model}
            />
          </Box>
        ) : null}
        {memoryOverlay ? (
          <Box marginBottom={1}>
            <MemoryList
              memoryDetails={activeSnapshot.memoryDetails}
              selectedIndex={memoryOverlay.selectedIndex}
              deleteConfirmMemoryId={memoryOverlay.deleteConfirmMemoryId}
              viewMemoryId={memoryOverlay.viewMemoryId}
              editState={memoryOverlay.editState}
            />
          </Box>
        ) : null}
        {sessionsOverlay ? (
          <Box marginBottom={1}>
            <SessionList
              sessions={sessions}
              selectedIndex={sessionsOverlay.selectedIndex}
              deleteConfirmSessionId={sessionsOverlay.deleteConfirmSessionId}
            />
          </Box>
        ) : null}
        {/** 只有没有任何面板覆盖时，聊天消息列表才会显示出来。 */}
        {isPanelVisible(uiState) ? null : (
          <ChatList
            messages={activeSnapshot.messages}
            toolExecutions={activeSnapshot.toolExecutions}
            assistantLabel={assistantLabel}
          />
        )}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <HorizontalDivider />
        {/** 输入框始终在底部，通过 disabled 状态配合 overlay / 运行状态控制可编辑性。 */}
        <PromptInput
          value={uiState.input}
          onChange={(value) => {
            dispatch({ type: "input/set", value });
          }}
          onSubmit={handlePromptSubmit}
          onHistoryUp={handleHistoryUp}
          onHistoryDown={handleHistoryDown}
          disabled={isPromptDisabled(uiState)}
          disabledReason={inputDisabledReason}
        />
        <HorizontalDivider />
      </Box>
      <StatusBar
        session={activeSnapshot.session}
        mode={mode}
        emotion={activeSnapshot.emotion.primary}
        statusMessage={uiState.statusMessage}
      />
    </Box>
  );
}
