import { isOriginAllowed } from './cors.js';

const configured = [
  'http://localhost:3000',
  'https://frontend-mu-eight-69.vercel.app',
  'https://travel-sense-site.vercel.app',
  'https://travel-sense-site-*.vercel.app',
].join(',');

describe('isOriginAllowed', () => {
  it('accepts the production frontend and local development', () => {
    expect(
      isOriginAllowed('https://frontend-mu-eight-69.vercel.app', configured),
    ).toBe(true);
    expect(isOriginAllowed('https://travel-sense-site.vercel.app', configured)).toBe(true);
    expect(isOriginAllowed('http://localhost:3000', configured)).toBe(true);
  });

  it('accepts only scoped TravelSense Vercel previews', () => {
    expect(
      isOriginAllowed(
        'https://travel-sense-site-git-main-haha-615c.vercel.app',
        configured,
      ),
    ).toBe(true);
    expect(isOriginAllowed('https://unrelated-project.vercel.app', configured)).toBe(false);
  });
});
