// dryft:relates core.ci
declare module "picomatch" {
  interface PicomatchOptions {
    dot?: boolean;
  }

  type Matcher = (input: string) => boolean;

  interface Picomatch {
    (patterns: string | string[], options?: PicomatchOptions): Matcher;
    isMatch(
      input: string,
      patterns: string | string[],
      options?: PicomatchOptions
    ): boolean;
  }

  const picomatch: Picomatch;
  export default picomatch;
}
