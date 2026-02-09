# Add Git to Windows PATH (so PowerShell recognizes `git`)

## Step 1: Open Environment Variables

1. Press **Windows key** on your keyboard.
2. Type: **environment variables**
3. Click **"Edit the system environment variables"** (Control Panel).

## Step 2: Open PATH

1. In the "System Properties" window, click **"Environment Variables..."**.
2. Under **"User variables for Dell"** (top section), find **Path**.
3. Click **Path** once to select it, then click **"Edit..."**.

## Step 3: Add Git’s folder

1. Click **"New"**.
2. Paste exactly (or type):
   ```
   C:\Program Files\Git\cmd
   ```
   If Git was installed in a different drive (e.g. D:), use that path instead, but it must end with `\cmd`.
3. Click **OK** on the "Edit environment variable" window.
4. Click **OK** on "Environment Variables".
5. Click **OK** on "System Properties".

## Step 4: Restart Cursor

1. **Close Cursor completely** (File → Exit or close the window).
2. Open Cursor again and open your project.
3. Open the terminal (Terminal → New Terminal).
4. Run:
   ```
   git --version
   ```
   You should see something like: `git version 2.43.0.windows.1`.

---

## If Git is not in `C:\Program Files\Git\cmd`

- Open **File Explorer** and go to `C:\Program Files`.
- Look for a folder named **Git**. If you find it, the path to add is: `C:\Program Files\Git\cmd`
- If Git is not there, search for **git.exe** (Windows search bar or in `C:\`) and note the folder that contains it. The folder you add to PATH is the one that **contains** `git.exe` (often that folder is named `cmd` inside the Git install).
