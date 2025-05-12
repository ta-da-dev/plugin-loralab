// Basic tests for the LoraLab plugin
const { loraLabPlugin, LoraLabService } = require('../dist/index.js');

describe('LoraLab Plugin Structure', () => {
  test('plugin has correct structure', () => {
    expect(loraLabPlugin).toBeDefined();
    expect(loraLabPlugin.name).toBe('plugin-loralab');
    expect(loraLabPlugin.description).toContain('image generation');
    expect(loraLabPlugin.services).toContain(LoraLabService);
    expect(loraLabPlugin.actions.length).toBeGreaterThan(0);
    
    // Verify GENERATE_IMAGE action exists
    const generateImageAction = loraLabPlugin.actions.find(action => action.name === 'GENERATE_IMAGE');
    expect(generateImageAction).toBeDefined();
    expect(generateImageAction.similes).toContain('CREATE_IMAGE');
    
    // Verify GENERATE_VIDEO action exists
    const generateVideoAction = loraLabPlugin.actions.find(action => action.name === 'GENERATE_VIDEO');
    expect(generateVideoAction).toBeDefined();
    expect(generateVideoAction.similes).toContain('CREATE_VIDEO');
  });
});

describe('API configuration validation', () => {
  test('config schema validates API key', async () => {
    const mockRuntime = {
      getSetting: jest.fn().mockImplementation((key) => {
        if (key === 'LORALAB_API_KEY') return 'test-api-key';
        return null;
      }),
      character: { name: 'Test Character' },
      getService: jest.fn().mockReturnValue({})
    };
    
    // Test init function (should not throw with valid API key)
    await expect(loraLabPlugin.init({ 
      LORALAB_API_KEY: 'test-api-key' 
    }, mockRuntime)).resolves.not.toThrow();
    
    // Test the validation in the image action
    const generateImageAction = loraLabPlugin.actions.find(action => action.name === 'GENERATE_IMAGE');
    const imageValidation = await generateImageAction.validate(mockRuntime, { content: { text: 'test prompt' } }, {});
    expect(imageValidation).toBe(true);
    
    // Test the validation in the video action
    const generateVideoAction = loraLabPlugin.actions.find(action => action.name === 'GENERATE_VIDEO');
    const videoValidation = await generateVideoAction.validate(mockRuntime, { content: { text: 'test prompt' } }, {});
    expect(videoValidation).toBe(true);
  });
});

describe('Action handlers', () => {
  test('GENERATE_VIDEO action structure', () => {
    const generateVideoAction = loraLabPlugin.actions.find(action => action.name === 'GENERATE_VIDEO');
    expect(generateVideoAction).toBeDefined();
    expect(typeof generateVideoAction.handler).toBe('function');
    expect(generateVideoAction.validate).toBeDefined();
    expect(generateVideoAction.examples.length).toBeGreaterThan(0);
    expect(generateVideoAction.similes).toContain('MAKE_VIDEO');
    expect(generateVideoAction.similes).toContain('RENDER_VIDEO');
  });
}); 