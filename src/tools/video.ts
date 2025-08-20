/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import path from 'path';
import os from 'os';
import { z } from 'zod';
import { defineTool } from './tool.js';
import { sanitizeForFilePath } from '../utils/fileUtils.js';

const startRecording = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_start_recording',
    title: 'Start video recording',
    description: 'Start recording browser session video. This must be called BEFORE performing browser actions you want to record. New browser contexts will be created with video recording enabled. Videos are automatically saved when pages/contexts close.',
    inputSchema: z.object({
      size: z.object({
        width: z.number().optional().describe('Video width in pixels (default: scales to fit 800x800)'),
        height: z.number().optional().describe('Video height in pixels (default: scales to fit 800x800)'),
      }).optional().describe('Video recording size'),
      filename: z.string().optional().describe('Base filename for video files (default: session-{timestamp}.webm)'),
      outputDir: z.string().optional().describe('Custom directory to save video files (default: auto-generated temp directory)'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = params.filename || `session-${timestamp}`;

    let videoDir: string;
    if (params.outputDir) {
      // Use user-specified directory
      videoDir = path.resolve(params.outputDir);
    } else {
      // Use default directory structure
      const outputDir = context.config.outputDir
          ?? path.join(os.tmpdir(), 'playwright-mcp-output', sanitizeForFilePath(new Date().toISOString()));
      videoDir = path.join(outputDir, 'videos');
    }

    // Update context options to enable video recording
    const recordVideoOptions: any = {
      dir: videoDir,
    };

    if (params.size && params.size.width && params.size.height) {
      recordVideoOptions.size = {
        width: params.size.width,
        height: params.size.height
      };
    } else {
      recordVideoOptions.size = { width: 800, height: 800 };
    }


    // Store video recording config in context for future browser contexts
    context.setVideoRecording(recordVideoOptions, baseFilename);

    response.addResult(`✓ Video recording enabled. Videos will be saved to: ${videoDir}`);
    response.addResult(`✓ Video files will be named: ${baseFilename}-*.webm`);
    response.addResult(`\nNext steps:`);
    response.addResult(`1. Navigate to pages and perform browser actions`);
    response.addResult(`2. Use browser_stop_recording when finished to save videos`);
    response.addResult(`3. Videos are automatically saved when pages close`);
    response.addCode(`// Video recording enabled for new browser contexts`);
    response.addCode(`const context = await browser.newContext({`);
    response.addCode(`  recordVideo: {`);
    response.addCode(`    dir: '${videoDir}',`);
    response.addCode(`    size: { width: ${recordVideoOptions.size.width}, height: ${recordVideoOptions.size.height} }`);

    response.addCode(`  }`);
    response.addCode(`});`);
  },
});

const stopRecording = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_stop_recording',
    title: 'Stop video recording',
    description: 'Stop video recording and return the paths to recorded video files. This closes all active pages to ensure videos are properly saved. Call this when you want to finalize and access the recorded videos.',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    const videoPaths = await context.stopVideoRecording();

    if (videoPaths.length === 0) {
      response.addResult('No video recording was active.');
      return;
    }

    response.addResult(`✓ Video recording stopped. ${videoPaths.length} video file(s) saved:`);
    for (const videoPath of videoPaths)
      response.addResult(`📹 ${videoPath}`);

    response.addResult(`\nVideos are now ready for viewing or sharing.`);
    response.addCode(`// Video recording stopped`);
    response.addCode(`await context.close(); // Ensures video is saved`);
  },
});

const getRecordingStatus = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_recording_status',
    title: 'Get video recording status',
    description: 'Check if video recording is currently enabled and get recording details. Use this to verify recording is active before performing actions, or to check output directory and settings.',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    const recordingInfo = context.getVideoRecordingInfo();

    if (!recordingInfo.enabled) {
      response.addResult('❌ Video recording is not enabled.');
      response.addResult('\n💡 To start recording:');
      response.addResult('1. Use browser_start_recording to enable recording');
      response.addResult('2. Navigate to pages and perform actions');
      response.addResult('3. Use browser_stop_recording to save videos');
      return;
    }

    response.addResult(`✅ Video recording is active:`);
    response.addResult(`📁 Output directory: ${recordingInfo.config?.dir}`);
    response.addResult(`📝 Base filename: ${recordingInfo.baseFilename}`);
    if (recordingInfo.config?.size)
      response.addResult(`📐 Video size: ${recordingInfo.config.size.width}x${recordingInfo.config.size.height}`);
    else
      response.addResult(`📐 Video size: auto-scaled to fit 800x800`);

    response.addResult(`🎬 Active recordings: ${recordingInfo.activeRecordings}`);
    if (recordingInfo.activeRecordings === 0)
      response.addResult(`\n💡 Tip: Navigate to pages to start recording browser actions`);
  },
});

export default [
  startRecording,
  stopRecording,
  getRecordingStatus,
];
