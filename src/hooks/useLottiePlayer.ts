import { AnimationEventName, AnimationItem } from "lottie-web";
import { AnimationEventHandler, useCallback, useEffect, useState } from "react";
import isFunction from "../utils/isFunction";
import logger from "../utils/logger";
import usePlayerState from "./usePlayerState";

export type LottiePlayerEventListener = {
  name: AnimationEventName;
  handler: AnimationEventHandler;
};
export type LottiePlayerEventPartialListener = Omit<LottiePlayerEventListener, "handler"> & {
  handler?: LottiePlayerEventListener["handler"];
};

export enum LottiePlayerState {
  Loading = "loading",
  Playing = "playing",
  Paused = "paused",
  Stopped = "stopped",
  Frozen = "frozen",
  Error = "error",
}

export enum LottiePlayerEvent {
  Load = "load",
  Error = "error",
  Ready = "ready",
  Play = "play",
  Pause = "pause",
  Stop = "stop",
  Freeze = "freeze",
  LoopCompleted = "loop_completed",
  Complete = "complete",
  Frame = "frame",
}

type LottiePlayerOptions = {
  onPlayerEvent?: (playerState: LottiePlayerEvent) => void;
  onPlayerStateChange?: (playerState: LottiePlayerState) => void;
};

const useLottiePlayer = (animationItem: AnimationItem | null, options?: LottiePlayerOptions) => {
  const { onPlayerEvent, onPlayerStateChange } = options ?? {};

  // State of the player
  const { previousPlayerState, playerState, setPlayerState } = usePlayerState({
    initialState: LottiePlayerState.Loading,
    onChange: (previousPlayerState, newPlayerState) => {
      if (onPlayerStateChange && isFunction(onPlayerStateChange)) {
        onPlayerStateChange(newPlayerState);
      }
    },
  });

  // State of the current frame
  const [currentFrame, setCurrentFrame] = useState<number>(0);

  /**
   * Trigger an event
   * @param eventName
   */
  const triggerEvent = useCallback(
    (eventName: LottiePlayerEvent) => {
      if (onPlayerEvent) {
        onPlayerEvent(eventName);
      }
    },
    [onPlayerEvent],
  );

  /**
   * Register the events when whe have a new animation item
   */
  useEffect(
    () => {
      if (!animationItem) {
        logger.log("⌛️ Player doesn't have the animation item yet", animationItem);
        return;
      }

      // Indicate that the player is loading
      setPlayerState(LottiePlayerState.Loading);

      // Add event listeners to the animation
      const listeners: LottiePlayerEventListener[] = [
        {
          name: "complete",
          handler: () => {
            setPlayerState(LottiePlayerState.Stopped);
            triggerEvent(LottiePlayerEvent.Complete);
          },
        },
        {
          name: "loopComplete",
          handler: () => {
            triggerEvent(LottiePlayerEvent.LoopCompleted);
          },
        },
        {
          name: "enterFrame",
          handler: () => {
            triggerEvent(LottiePlayerEvent.Frame);
            if (animationItem.currentFrame !== currentFrame) {
              setCurrentFrame(animationItem.currentFrame);
            }
          },
        },
        { name: "segmentStart", handler: () => undefined },
        { name: "config_ready", handler: () => undefined },
        {
          name: "data_ready",
          handler: () => {
            triggerEvent(LottiePlayerEvent.Ready);
          },
        },
        {
          name: "data_failed",
          handler: () => {
            setPlayerState(LottiePlayerState.Error);
          },
        },
        { name: "loaded_images", handler: () => undefined },
        {
          name: "DOMLoaded",
          handler: () => {
            triggerEvent(LottiePlayerEvent.Load);
            setPlayerState(
              animationItem.autoplay ? LottiePlayerState.Playing : LottiePlayerState.Stopped,
            );
          },
        },
        { name: "destroy", handler: () => undefined },
      ];

      logger.log("👂 Registering the event listeners");

      // Attach event listeners and return functions to deregister them
      const listenerDeregisterList = listeners.map((listener) => {
        try {
          animationItem?.addEventListener(listener.name, listener.handler);
        } catch (e) {
          // * There might be cases in which the `animationItem` exists but
          // * it's not ready yet, and in that case `addEventListener` will
          // * throw an error. That's why we skip these errors.
          // TODO: check if `lottie-web` offers a way to check if the animation
          //  is able to add events
        }

        // Return a function to deregister this listener
        return () => {
          try {
            animationItem?.removeEventListener(listener.name, listener.handler);
          } catch (e) {
            // * There might be cases in which the `animationItem` exists but
            // * it was destroyed, and in that case `removeEventListener` will
            // * throw an error. That's why we skip these errors.
            // TODO: check if `lottie-web` offers a way to check if the animation
            //  is able to remove events
          }
        };
      });

      // Cleanup on unmount
      return () => {
        logger.log("🧹 Lottie Player is unloading, cleaning up...");
        listenerDeregisterList.forEach((deregister) => deregister());
        setPlayerState(LottiePlayerState.Loading);
      };
    },
    // * We are disabling the `exhaustive-deps` here because we want to
    // * re-render only when the `animationItem` changes
    // ! DON'T CHANGE because we will end up unnecessary re-registering the events
    // ! listeners which might affect the performance and the player's functionality
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [animationItem],
  );

  /**
   * Interaction methods
   */
  // (Method) Play
  const play = () => {
    if (animationItem) {
      triggerEvent(LottiePlayerEvent.Play);

      animationItem.play();

      setPlayerState(LottiePlayerState.Playing);
    }
  };

  // (Method) Pause
  const pause = () => {
    if (animationItem) {
      triggerEvent(LottiePlayerEvent.Pause);

      animationItem.pause();

      setPlayerState(LottiePlayerState.Paused);
    }
  };

  // (Method) Stop
  const stop = () => {
    if (animationItem) {
      triggerEvent(LottiePlayerEvent.Stop);

      animationItem.goToAndStop(1);

      setPlayerState(LottiePlayerState.Stopped);
    }
  };

  // (Method) Set player speed
  const setSpeed = (speed: number) => {
    animationItem?.setSpeed(speed);
  };

  // (Method) Set seeker
  const setSeeker = (seek: number, shouldPlay = false) => {
    if (!shouldPlay || playerState !== LottiePlayerState.Playing) {
      animationItem?.goToAndStop(seek, true);
      setPlayerState(LottiePlayerState.Paused);
    } else {
      animationItem?.goToAndPlay(seek, true);
      setPlayerState(LottiePlayerState.Playing);
    }
  };

  return {
    playerState,
    play,
    pause,
    stop,
    setSpeed,
    setSeeker,
  };
};

export default useLottiePlayer;
