    // src/utils/frontendLogger.ts

    interface FrontendLogger {
      info: (...args: any[]) => void;
      warn: (...args: any[]) => void;
      error: (...args: any[]) => void;
      debug: (...args: any[]) => void;
    }

    export const frontendLogger: FrontendLogger = {
      info: (...args) => {
        if (import.meta.env.DEV) { // Use Vite's way to check for development mode
          console.info('[INFO]', ...args);
        }
      },
      warn: (...args) => {
        console.warn('[WARN]', ...args);
      },
      error: (...args) => {
        console.error('[ERROR]', ...args);
      },
      debug: (...args) => {
        if (import.meta.env.DEV) {
          console.debug('[DEBUG]', ...args);
        }
      },
    };
    