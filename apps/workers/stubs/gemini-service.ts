class GeminiServiceStub {
  async sendMessageToChat(
    _userId: string,
    _sessionId: string,
    _message: string,
    _propertyId?: string
  ): Promise<string> {
    throw new Error('geminiService is not available in the workers shared backend build');
  }
}

export const geminiService = new GeminiServiceStub();
