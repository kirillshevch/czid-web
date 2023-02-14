import fs from "fs";
import path from "path";
import { chromium, expect, FullConfig } from "@playwright/test";
import dotenv from "dotenv";
import { tag } from "../utils/constants";
import { login } from "../utils/login";
import { getByTestID, getByText } from "../utils/selectors";

dotenv.config({ path: path.resolve(`.env.${process.env.NODE_ENV}`) });

/**
 * This function is run once at the start of the test
 * This is where we established shared cookies and other setups we want to
 * do before running any test
 * @param config
 */
async function globalSetup(config: FullConfig): Promise<void> {
  const { storageState, baseURL } = config.projects[0].use;
  process.env.BASEURL = baseURL;
  if (process.env.NODE_ENV === "ci") {
    process.env.CI = "true";
  }
  let username;
  let password;
  if (process.env.NODE_ENV === "ci" || process.env.NODE_ENV === "local") {
    username = process.env.CZID_USERNAME;
    password = process.env.CZID_PASSWORD;
  } else {
    username = process.env.USERNAME;
    password = process.env.PASSWORD;
  }
  if (process.env.NODE_ENV === "ci" || !checkCookies()) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await Promise.all([
      page.goto(`${process.env.BASEURL}`, { waitUntil: "networkidle" }),
    ]);
    expect(page.locator(getByText(tag))).toBeVisible({ timeout: 120000 });
    await page.locator(getByTestID("home-top-nav-login")).click();
    await login(page, username, password);
    await page.context().storageState({ path: storageState as string });
    await browser.close();
  }
}
export default globalSetup;

/**
 * This function checks if there is already valid cookie and skips login process
 * This is very helpful during development when we run lots of tests
 * @returns
 */
function checkCookies(): boolean {
  try {
    const cookieFile = "/tmp/state.json";
    const currentTime = new Date().getTime();
    const cookieJson = JSON.parse(fs.readFileSync(cookieFile).toString())[
      "cookies"
    ];
    const cookie = cookieJson.find(cookie => cookie.name === "auth0");
    const expires = cookie["expires"] as number;
    const domain = cookie["domain"];
    if (expires > currentTime && domain.includes(process.env.DOMAIN)) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
}
