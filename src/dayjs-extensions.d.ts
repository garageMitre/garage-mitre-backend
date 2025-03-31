// src/dayjs-extensions.d.ts

import * as dayjs from 'dayjs';

declare module 'dayjs' {
  export function tz(date?: dayjs.ConfigType, format?: string, timezone?: string): dayjs.Dayjs;
  export function tz(timezone: string): dayjs.Dayjs;

  interface Dayjs {
    tz(timezone: string): Dayjs;
  }
}
