import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return null;

    // Normalize fields
    const normalized = {
      ...user,
      sub: user.sub ?? user.userId,   // ⚡ Fix here
      id: user.id ?? user.userId,     // Optional but helpful
    };

    // Return specific field
    if (data) return normalized[data];

    // Or return the whole user object
    return normalized;
  },
);
