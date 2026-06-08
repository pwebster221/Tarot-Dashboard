// The previous config existed only to lint Firestore security rules via
// @firebase/eslint-plugin-security-rules. Firebase was removed (Authentik OIDC
// migration), so this is reduced to a minimal flat config. The canonical
// typecheck for this repo is `npm run lint` (= tsc --noEmit).
export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*'],
  },
];
