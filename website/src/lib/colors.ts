// Same hues as the annotated videos (src/render.py), converted from BGR.
export const CLASS_COLORS: Record<string, string> = {
  car: "#3c96eb",
  bus: "#fac83c",
  truck: "#f08c28",
  motorcycle: "#dc5ac8",
  bicycle: "#5adca0",
  person: "#5adc5a",
};

export const EVENT_COLORS: Record<string, string> = {
  stop_line: "#e63c3c",
  jaywalking: "#ffaa00",
  failure_to_yield: "#8c6cf0",
  red_light: "#c2255c",
  stopped_vehicle: "#1098ad",
  wrong_way: "#5c7cfa",
  illegal_u_turn: "#94d82d",
  accident: "#fa5252",
  near_miss: "#f783ac",
};

export const SIGNAL_COLORS: Record<string, string> = {
  red: "#e03131",
  amber: "#f59f00",
  green: "#37b24d",
  unknown: "#868e96",
};

export const eventColor = (label: string) => EVENT_COLORS[label] ?? "#868e96";
export const classColor = (cls: string) => CLASS_COLORS[cls] ?? "#868e96";
