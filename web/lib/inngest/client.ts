import { Inngest, EventSchemas } from "inngest";
import type { Events } from "./events";

export const inngest = new Inngest({
  id: "orq-agent-designer",
  schemas: new EventSchemas().fromRecord<Events>(),
});
