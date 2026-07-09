declare module "email-existence" {
  const emailExistence: {
    check(email: string, callback: (error: Error | null, response: boolean) => void): void;
  };

  export default emailExistence;
}
