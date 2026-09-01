import { Audio } from "expo-av";

let soundPromise: Promise<Audio.Sound> | null = null;

function loadSound(): Promise<Audio.Sound> {
  if (!soundPromise) {
    soundPromise = Audio.Sound.createAsync(require("../../assets/sounds/incoming.mp3")).then(
      ({ sound }) => sound
    );
  }
  return soundPromise;
}

/** The classic "you've got a message" cue — only works while the app is in
 * the foreground (there's no background push infra behind this yet). */
export async function playIncomingSound(): Promise<void> {
  try {
    const sound = await loadSound();
    await sound.replayAsync();
  } catch {
    // Missing/unsupported audio hardware, or the asset failed to load — a
    // silent app is a much smaller problem than a crashed one.
  }
}
