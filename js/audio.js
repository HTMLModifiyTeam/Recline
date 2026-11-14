var unlocked = new WeakMap();
export default function(context, samples) {
  if (!context || context.state === "closed") return;
  if (context.state !== "running") {
    unlocked.set(context, false);
    try {
      var pending = context.resume();
      if (pending && pending.catch) pending.catch(() => { });
    } catch { }
  }
  if (!unlocked.get(context)) {
    try {
      var warmup = context.createBufferSource();
      warmup.buffer = context.createBuffer(1, samples || 1, context.sampleRate);
      warmup.connect(context.destination);
      warmup.onended = () => {
        unlocked.set(context, context.state === "running");
        warmup.disconnect();
      };
      warmup.start(0);
    } catch { }
  }
};