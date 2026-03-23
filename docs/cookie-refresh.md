# How to Refresh X/Twitter Cookies

The bookmark fetcher uses browser cookies to access your X bookmarks. X invalidates these cookies every few weeks or months — there is no fixed schedule. When they expire, you just refresh them manually.

## How to Know Cookies Have Expired

- `fetch-bookmarks.py` prints **"Unauthorized — cookies are expired or invalid"** and exits
- The Sunday automation logs show the same error
- The weekly briefing is missing bookmark content

## How to Refresh (5 minutes)

1. Open **Chrome** and go to [x.com](https://x.com). Make sure you are logged in.

2. Open DevTools: press **Cmd + Option + I**

3. Click the **Application** tab at the top of DevTools.
   - If you do not see it, click the **>>** arrows to find it in the overflow menu.

4. In the left sidebar, expand **Cookies** and click **https://x.com**.

5. Find the cookie named **`ct0`**. Double-click its **Value** column to select it, then copy it (Cmd+C). This is a long string of letters and numbers.

6. Find the cookie named **`auth_token`**. Copy its value the same way. This one is shorter.

7. Open your `.env` file:
   ```
   open ~/brief-signal/.env
   ```

8. Replace the old values with the ones you just copied:
   ```
   X_CT0=paste-ct0-value-here
   X_AUTH_TOKEN=paste-auth-token-value-here
   ```

9. Save the file.

10. Test that it works:
    ```
    python3 ~/brief-signal/scripts/fetch-bookmarks.py
    ```
    You should see bookmarks printing to the terminal. If you still get "Unauthorized," double-check that you copied the full values with no extra spaces.

## How Often

There is no set schedule. Cookies last anywhere from a few weeks to a few months. Just refresh them when the script tells you they have expired.
