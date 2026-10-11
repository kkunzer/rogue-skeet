/**
 * Test-only time dilation (`?simspeed=N`, honoured only in dev or with `?test`): the game loop
 * advances N sim seconds per real second and the pointer clock maps event timestamps by the same
 * factor, so bots driving real pointer events stay accurate. Always 1 in normal play.
 */
export const timeScale = { value: 1 };

/**
 * Timestamp (performance.now() domain) of the animation frame being simulated. The sim clock is
 * anchored to it, not to when the render callback happens to run, so a late frame cannot skew the
 * mapping from input timestamps to sim time. 0 outside the rAF loop.
 */
export const frameClock = { ms: 0 };
