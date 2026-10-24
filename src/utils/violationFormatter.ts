import { getViolationPenalty } from '../constants';

export interface ViolationInfo {
  title: string;
  description: string;
  penalty: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  advice: string;
}

export function getViolationInfo(type: string, details?: any): ViolationInfo {
  const penalty = getViolationPenalty(type);
  switch (type) {
    case 'ELECTRONIC_DEVICE_USAGE':
      return {
        title: 'Electronic Device Detected',
        description: `An unauthorized electronic device (${details?.device || details?.deviceClass || 'cell phone / remote / secondary screen'}) was detected in your camera feed.`,
        penalty: 70, // Direct decrease to 30
        severity: 'critical',
        advice: 'All electronic devices are strictly prohibited during the exam.'
      };
    case 'MOBILE_PHONE_USAGE':
      return {
        title: 'Electronic Device / Phone Detected',
        description: 'A mobile phone or electronic device was detected in your camera feed.',
        penalty: 70, // Direct decrease to 30
        severity: 'critical',
        advice: 'Please put away all electronic devices and smartphones immediately.'
      };
    case 'IDENTITY_MISMATCH':
      return {
        title: 'Identity Mismatch / Unauthorized Person',
        description: details?.similarityScore !== undefined
          ? `Live face does not match enrolled student biometric profile (${details.similarityScore}% similarity).`
          : 'The person in front of the camera does not match the registered student.',
        penalty: penalty || 20,
        severity: 'critical',
        advice: 'Only the enrolled student whose face was verified at login is permitted to sit for this exam.'
      };
    case 'MULTIPLE_FACES':
      return {
        title: 'Multiple Faces Detected',
        description: `More than one person (${details?.count ? details.count + ' people' : 'multiple faces'}) was detected in your camera frame.`,
        penalty: penalty || 15,
        severity: 'critical',
        advice: 'Ensure you are alone in the room and no other person enters the camera view.'
      };
    case 'BACKGROUND_PERSON':
    case 'BACKGROUND_PERSON_DETECTED':
      return {
        title: 'Background Person Detected',
        description: `An unauthorized background person (${details?.count ? details.count + ' people' : 'secondary person'}) was detected in the room.`,
        penalty: penalty || 15,
        severity: 'critical',
        advice: 'Ensure you are strictly alone in the room. No other individual is permitted in the exam space.'
      };
    case 'FACE_MISSING':
      return {
        title: 'Face Missing / Not Visible',
        description: 'Your face is not visible in the camera frame or you looked completely away.',
        penalty: penalty || 10,
        severity: 'high',
        advice: 'Position yourself directly in front of the camera with good lighting.'
      };
    case 'TAB_SWITCH':
      return {
        title: 'Tab Switch / Window Inactive',
        description: 'You switched browser tabs or navigated away from the exam window.',
        penalty: 5,
        severity: 'high',
        advice: 'Keep the exam window active and focused at all times.'
      };
    case 'COPY_ATTEMPT':
      return {
        title: 'Copy / Paste / Shortcut Attempt',
        description: details?.key ? `Forbidden key combination pressed (${details.key}).` : 'Unauthorized copy, paste, or right-click action attempted.',
        penalty: 5,
        severity: 'high',
        advice: 'Do not use copy, paste, right-click, or developer tool shortcuts.'
      };
    case 'SCREENSHOT_ATTEMPT':
    case 'SCREEN_CAPTURE_ATTEMPT':
      return {
        title: 'Screenshot Attempt Detected',
        description: details?.shortcut || details?.key 
          ? `Screen capture shortcut or tool detected (${details.shortcut || details.key}).` 
          : 'Attempt to capture or screenshot the exam interface was intercepted.',
        penalty: 5,
        severity: 'high',
        advice: 'Taking screenshots or using screen clipping tools during the examination is strictly prohibited.'
      };
    case 'EXCESSIVE_MOVEMENT':
      return {
        title: 'Excessive Physical Movement',
        description: 'Unusual, rapid, or constant body movement was detected by AI monitoring.',
        penalty: 5,
        severity: 'medium',
        advice: 'Remain still and maintain a stable sitting posture in front of your camera.'
      };
    case 'BACKGROUND_TALKING':
    case 'PEOPLE_TALKING':
    case 'BACKGROUND_VOICE':
      return {
        title: 'Background People Talking Detected',
        description: details?.transcript 
          ? `Conversation or speech detected: "${details.transcript}"`
          : `Background people talking or conversation sound detected (intensity: ${details?.intensity || 'elevated'}).`,
        penalty: 5,
        severity: 'high',
        advice: 'Maintain absolute silence. Talking, whispering, or background conversations are strictly prohibited.'
      };
    case 'VOICE_DETECTED':
      return {
        title: 'Voice / Speaking Detected',
        description: `Speaking or audio chatter detected (intensity: ${details?.intensity || 'elevated'}).`,
        penalty: 5,
        severity: 'high',
        advice: 'Please remain silent during the entire exam session.'
      };
    case 'LOUD_AUDIO':
      return {
        title: 'Loud Noise / Audio Spike',
        description: `High volume audio level (${details?.intensity ? Math.round(details.intensity) + ' dB' : 'loud sound'}) detected.`,
        penalty: 5,
        severity: 'critical',
        advice: 'Ensure your exam environment is quiet with no background noise.'
      };
    case 'IDLE_DETECTED':
      return {
        title: 'Idle Inactivity Detected',
        description: 'No user input (mouse, touch, or keyboard) detected for over 60 seconds.',
        penalty: 5,
        severity: 'medium',
        advice: 'Move your mouse or press a key to keep your session active.'
      };
    case 'LOOKING_AWAY':
      return {
        title: 'Looking Away From Screen',
        description: 'Gaze tracking detected you looking away from the screen for an extended period.',
        penalty: 5,
        severity: 'medium',
        advice: 'Keep your eyes focused on the screen and exam questions.'
      };
    case 'FULLSCREEN_EXIT':
      return {
        title: 'Fullscreen Mode Exited',
        description: 'You exited mandatory fullscreen mode.',
        penalty: 5,
        severity: 'high',
        advice: 'Return to fullscreen mode immediately.'
      };
    case 'PROHIBITED_OBJECT':
      return {
        title: 'Prohibited Object Detected',
        description: 'An unauthorized item was detected by AI vision.',
        penalty: penalty || 25,
        severity: 'critical',
        advice: 'Clear your desk of all unapproved items, books, or devices.'
      };
    case 'TURNING_AROUND':
      return {
        title: 'Turning Around / Body Out of Frame',
        description: 'You turned away or leaned completely out of view of the camera.',
        penalty: 5,
        severity: 'medium',
        advice: 'Face forward towards the camera and screen.'
      };
    case 'WINDOW_RESIZE':
      return {
        title: 'Window Resized',
        description: 'The browser window size was modified during the exam.',
        penalty: 5,
        severity: 'low',
        advice: 'Keep the browser window maximized.'
      };
    case 'AUDIO_DEVICE_CHANGE':
      return {
        title: 'Audio Device Changed',
        description: 'A microphone or headset was plugged in or disconnected.',
        penalty: 5,
        severity: 'critical',
        advice: 'Do not change or disconnect audio input hardware during the exam.'
      };
    case 'MANUAL_OVERRIDE':
      return {
        title: 'Proctor Manual Flag',
        description: 'An exam auditor flagged a violation for your session.',
        penalty: 5,
        severity: 'medium',
        advice: 'Follow all proctor instructions.'
      };
    default:
      return {
        title: type.replace(/_/g, ' ').toUpperCase(),
        description: 'A proctoring violation was recorded by the system.',
        penalty: 5,
        severity: 'medium',
        advice: 'Maintain exam integrity.'
      };
  }
}
