export async function retry(task, options = {}) {

  const {
    maxRetries = 3,
    baseDelay = 3000
  } = options;

  let attempt = 0;

  while (attempt < maxRetries) {

    try {

      return await task();

    } catch (error) {

      attempt++;

      console.error(
        `[Retry] Attempt ${attempt}/${maxRetries}`,
        error.message
      );

      if (attempt >= maxRetries) {
        throw error;
      }

      const delay =
        baseDelay * attempt;

      await new Promise(resolve =>
        setTimeout(resolve, delay)
      );

    }

  }

}
