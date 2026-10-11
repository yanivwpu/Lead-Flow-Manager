import type { Request } from "express";

/** Do not redirect until Passport login and the persistent session store both succeed. */
export async function establishShopifyLogin(
  req: Pick<Request, "login" | "session">,
  user: Express.User,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.login(user, err => err ? reject(err) : resolve());
  });
  await new Promise<void>((resolve, reject) => {
    req.session.save(err => err ? reject(err) : resolve());
  });
}
