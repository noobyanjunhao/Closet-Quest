export function releaseInfo(env=process.env){
  const revision=env.RENDER_GIT_COMMIT||env.CLOSET_RELEASE_REVISION||'';
  return {version:'0.2.0-beta.1',protocol:'closet-beta-s9-v1',revision:/^[a-f\d]{40}$/i.test(revision)?revision:null};
}

