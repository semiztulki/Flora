import { Audio } from "expo-av";

const assets = {
  incoming: require("../../assets/sounds/incoming.mp3"),
  contactRequest: require("../../assets/sounds/contact_request.mp3"),
} as const;

type SoundName = keyof typeof assets;

const soundPromises = new Map<SoundName, Promise<Audio.Sound>>();

function loadSound(name: SoundName): Promise<Audio.Sound> {
  let promise = soundPromises.get(name);
  if (!promise) {
    promise = Audio.Sound.createAsync(assets[name]).then(({ sound }) => sound);
    soundPromises.set(name, promise);
  }
  return promise;
}

async function play(name: SoundName): Promise<void> {
  try {
    const sound = await loadSound(name);
    await sound.replayAsync();
  } catch {
    // Missing/unsupported audio hardware, or the asset failed to load — a
    // silent app is a much smaller problem than a crashed one.
  }
}

/** The classic "you've got a message" cue — only works while the app is in
 * the foreground (there's no background push infra behind this yet). */
export function playIncomingSound(): Promise<void> {
  return play("incoming");
}

/** A knock — someone is trying to add you as a contact. */
export function playContactRequestSound(): Promise<void> {
  return play("contactRequest");
}
