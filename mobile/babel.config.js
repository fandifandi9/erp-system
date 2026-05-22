module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Reanimated plugin sudah ditangani babel-preset-expo (SDK 54).
    // Jangan duplikasi plugin — bisa crash di release APK.
  };
};
