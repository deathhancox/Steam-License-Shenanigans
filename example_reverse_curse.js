// The example version contains the short Example ID List instead of the Main ID List for ease of example and modification.

// Redirect to Steam licenses page if not already there
if (window.location.href !== "https://store.steampowered.com/account/licenses/") {
    console.log("Redirecting to Steam licenses page...");
    window.location.href = "https://store.steampowered.com/account/licenses/";
    throw new Error("Redirecting to licenses page — script will stop here.");
}


// === CONFIGURATION ===
const allowSkipping = false;
const allowedSubIDs = new Set([
    1324901, 1324453, 1318820, 1318844, 1319382, 1319400,
    1319425, 1323568, 1324011, 1324041, 1326080, 1326791
]);

const defaultDelay = 1000;                   // 1 second between successful removals
const delayOnRateLimit = 3 * 60 * 1000;      // 3 minutes on rate-limit or API failure
const maxProcessingDelay = 30 * 60 * 1000;   // max 30 minutes cooldown
const minProcessingDelay = 1 * 60 * 1000;    // min 1 minute cooldown

const STORAGE_KEY = "steam_license_removal_state";

// === SESSION SETUP ===
alert("Hello Ender! :D\nDon't forget to leave the page open while the script does it's thing. ;)");
const sessionidMatch = document.cookie.match(/sessionid=([\w-]+)/);
if (!sessionidMatch) throw new Error("❌ Could not find sessionid. Are you logged in?");
const sessionid = sessionidMatch[1];

// === STATE ===
let removedCount = 0;
let index = 0;
let lastRequestTime = 0;
let dynamicCooldown = minProcessingDelay;
let subIDs = [];

// --- Load saved state ---
function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const state = JSON.parse(saved);
            if (Array.isArray(state.subIDs)) subIDs = state.subIDs;
            if (typeof state.index === "number") index = state.index;
            if (typeof state.removedCount === "number") removedCount = state.removedCount;
            if (typeof state.dynamicCooldown === "number") dynamicCooldown = state.dynamicCooldown;
            console.log(`🔄 Resuming from saved state: index=${index}, removedCount=${removedCount}, dynamicCooldown=${(dynamicCooldown/60000).toFixed(1)} min`);
            return true;
        } catch (e) {
            console.warn("⚠️ Failed to parse saved state, starting fresh.");
        }
    }
    return false;
}

// --- Save current state ---
function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        subIDs,
        index,
        removedCount,
        dynamicCooldown
    }));
}

// --- Clear saved state (optional) ---
function clearState() {
    localStorage.removeItem(STORAGE_KEY);
    console.log("🗑️ Saved state cleared.");
}

// === UTILITIES ===
function extractIdFromLink(link) {
    const match = link.match(/RemoveFreeLicense\(\s*(\d+)\s*,/);
    return match ? parseInt(match[1], 10) : null;
}

function getFilteredSubIDs() {
    return Array.from(document.querySelectorAll('a[href^="javascript:RemoveFreeLicense"]'))
        .map(link => extractIdFromLink(link.href))
        .filter(id => id !== null && allowedSubIDs.has(id));
}

async function removeGame(id) {
    console.log(`Removing game with ID ${id}...`);
    try {
        const response = await fetch('https://store.steampowered.com/account/removelicense', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://store.steampowered.com/account/licenses/'
            },
            body: `sessionid=${encodeURIComponent(sessionid)}&packageid=${encodeURIComponent(id)}`
        });

        if (!response.ok) {
            console.warn(`⚠️ HTTP error ${response.status} for game ID ${id}`);
            return "fail";
        }

        const text = await response.text();

        if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
            console.error(`❌ Received Non-JSON for game ID ${id}. Possible session expiration or rate limiting.`);
            console.warn(`⚠️ If you contact support regarding this issue, please provide the following information:`);
            console.log(text);
            return "fatal";
        }

        const data = JSON.parse(text);

        console.log(`📦 Steam response for package ${id}:`, data);
        if (data.success === 1) {
            removedCount++;
            console.log(`✅ Removed game ID ${id}. Total removed: ${removedCount}`);
            return ["success"];
        } else if (data.success === 8) {
            return ["undefined_id"];
        } else if (allowSkipping === true) {
            return ["skipped", data.success];
        } else if (allowSkipping === false) {
            console.warn(`⛔ Unknown response on ${id} (success code ${data.success}). Will retry after delay.`);
            return ["rate_limited"];
        } else {
            console.warn(`⚠️ Failed to remove game ID ${id}:`, data);
            return ["fail"];
        }
    } catch (error) {
        console.error(`❌ Error removing game ID ${id}:`, error);
        return "error";
    }
}

async function removeNext() {
    if (subIDs.length === 0) {
        subIDs = getFilteredSubIDs();
        if (subIDs.length === 0) {
            console.warn("⚠️ No matching subIDs found on this page.");
            clearState();
            return;
        }
    }

    if (index >= subIDs.length) {
        console.log(`🎉 Done! Removed ${removedCount} of ${subIDs.length} matching games.`);
        clearState();
        return;
    }

    const id = subIDs[index];
    const now = Date.now();
    let delay = Math.max(defaultDelay - (now - lastRequestTime), 0);

    console.log(`🕒 [${new Date().toLocaleTimeString()}] Removing game ID ${id} (#${index + 1} of ${subIDs.length})...`);

    lastRequestTime = now;
    const result = await removeGame(id);

    if (result[0] ==="fatal") {
        console.error("🚨 Fatal error encountered. Stopping script and skipping save to avoid corrupt state.");
        alert("FATAL ERROR: Please check console for details.");
        return;
    }

    if (result[0] ==="fail" && index > 0) {
        delay = delayOnRateLimit;
        console.warn(`⛔ Retrying game ID ${id} in ${delay / 60000} minutes due to failure...`);
    } else if (result[0] ==="rate_limited") {
        dynamicCooldown = Math.min(dynamicCooldown * 1.5, maxProcessingDelay);
        delay = dynamicCooldown;
        console.warn(`⛔ Rate limited / processing on game ID ${id}. Retrying in ${(delay / 60000).toFixed(1)} minutes...`);
    } else if (result[0] ==="success") {
        dynamicCooldown = Math.max(dynamicCooldown / 1.2, minProcessingDelay);
        index++;
    } else if (result[0] ==="undefined_id") {
        console.log(`❓ Game ID ${id} skipped because there was no package associated with the id.`);
        index++;
    } else if (result[0] ==="skipped") {
        console.log(`🔔 Game ID ${id} skipped because allowSkipping=${allowSkipping} (success code ${result[1]}).`);
        index++;
    } else {
        index++;
    }

    saveState();
    setTimeout(removeNext, delay);
}


// === START SCRIPT ===
if (!loadState()) {
    // No saved state, load subIDs fresh
    subIDs = getFilteredSubIDs();
    if (subIDs.length === 0) {
        console.warn("⚠️ No matching subIDs found on this page.");
        clearState();
        throw new Error("❗No matching subIDs found, aborting.");
    }
}

console.log("🚀 Starting removal of matching games...");
removeNext();