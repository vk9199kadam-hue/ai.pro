/**
 * Google AdMob Monetization Configuration
 * Official Google Test Ad Unit IDs for Android
 * (Replace with production IDs before Play Store release)
 */

export const ADMOB_CONFIG = {
  // Official Google Android Test Ad Units
  BANNER_ID: 'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL_ID: 'ca-app-pub-3940256099942544/1033173712',
  REWARDED_VIDEO_ID: 'ca-app-pub-3940256099942544/5224354917',
  
  // App ID from AdMob Console
  APP_ID: 'ca-app-pub-3940256099942544~3347511713',
};

/**
 * Simulates or triggers Google AdMob Interstitial Ad
 * Displayed while on-device Media3 rendering takes place.
 */
export async function showInterstitialAd(): Promise<boolean> {
  return new Promise((resolve) => {
    // In production, invoke MobileAds.showInterstitial()
    setTimeout(() => {
      resolve(true);
    }, 1500);
  });
}

/**
 * Simulates or triggers Google AdMob Rewarded Video
 * User watches 30s ad to unlock +1 free credit.
 */
export async function showRewardedVideoAd(): Promise<boolean> {
  return new Promise((resolve) => {
    // In production, invoke MobileAds.showRewarded()
    setTimeout(() => {
      resolve(true);
    }, 2000);
  });
}
