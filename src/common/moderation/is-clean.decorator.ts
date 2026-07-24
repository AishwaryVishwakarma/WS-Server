import {registerDecorator} from 'class-validator';
import type {ValidationOptions} from 'class-validator';
import {isProfane} from './text-moderation';

// Rejects a string field containing recognized profanity/slurs. Applied only
// to public, ungated identity fields (display name, bio, tag name) — never
// story or comment text, which stay behind the existing moderation
// queue/report flow (this site's subject matter is deliberately dark). A
// determined user can still evade the word-matcher; that's what user
// reporting (UserReport) backstops. Non-string values pass (leave presence/
// type checks to @IsString() etc. — this decorator only judges content).
export function IsClean(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isClean',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value !== 'string' || !isProfane(value);
        },
        defaultMessage(): string {
          return "$property contains language that isn't allowed here";
        },
      },
    });
  };
}
