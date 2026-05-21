declare module "email-reply-parser" {
  export interface Email {
    getVisibleText(): string;
  }
  export default class EmailReplyParser {
    read(body: string): Email;
  }
}
