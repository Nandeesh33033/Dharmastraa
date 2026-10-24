import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PENALTIES: Record<string, number> = {
  // Face & Vision
  IDENTITY_MISMATCH: 20,
  MULTIPLE_FACES: 15,
  BACKGROUND_PERSON: 15,
  BACKGROUND_PERSON_DETECTED: 15,
  FACE_MISSING: 10,
  LOOKING_AWAY: 5,
  TURNING_AROUND: 5,
  EXCESSIVE_MOVEMENT: 5,
  PROHIBITED_OBJECT: 25,
  ELECTRONIC_DEVICE_USAGE: 70, // Direct decrease to 30
  MOBILE_PHONE_USAGE: 70, // Direct decrease to 30

  // Browser & Environment
  TAB_SWITCH: 5,
  WINDOW_RESIZE: 5,
  FULLSCREEN_EXIT: 5,
  COPY_ATTEMPT: 5,
  SCREENSHOT_ATTEMPT: 5,
  SCREEN_CAPTURE_ATTEMPT: 5,
  IDLE_DETECTED: 5,

  // Audio
  AUDIO_DEVICE_CHANGE: 5,
  BACKGROUND_TALKING: 5,
  PEOPLE_TALKING: 5,
  BACKGROUND_VOICE: 5,
  VOICE_DETECTED: 5,
  LOUD_AUDIO: 5
};

export function getViolationPenalty(type: string): number {
  if (type in PENALTIES) {
    return PENALTIES[type];
  }
  return 5;
}

export interface Question {
  id: string | number;
  text: string;
  type?: 'mcq' | 'multiple_select' | 'true_false' | 'short_answer';
  options?: string[];
  correctAnswer?: number | number[] | string | boolean;
  points?: number;
}

export interface TeacherAccount {
  id: string;
  teacherId: string;
  name: string;
  email: string;
  password: string;
  department?: string;
  createdAt: string;
  createdBy?: string;
}

export interface StudentAccount {
  id: string;
  rollNo: string;
  name: string;
  password?: string;
  passwordHash?: string;
  faceSnapshot?: string; // Base64 enrolled facial image
  faceDescriptor?: number[]; // Extracted 3D facial biometric embedding
  faceEnrolledAt?: string;
  createdAt: string;
}

export const DEFAULT_STUDENTS: StudentAccount[] = [
  {
    id: 'std_demo_1',
    rollNo: '4JN23CS089',
    name: 'Alex Johnson',
    password: 'student123',
    createdAt: new Date().toISOString()
  },
  {
    id: 'std_demo_2',
    rollNo: '4JN23CS001',
    name: 'Priya Sharma',
    password: 'student123',
    createdAt: new Date().toISOString()
  }
];

export const DEFAULT_TEACHERS: TeacherAccount[] = [
  {
    id: 'tch_main_admin',
    teacherId: 'MAINADMIN',
    name: 'keerthan Prabhu',
    email: 'mygamesprabhu@gmail.com',
    password: 'ADMINDHARMAASTRA',
    department: 'Computer Science and Engineering',
    createdAt: new Date().toISOString(),
    createdBy: 'System Root'
  },
  {
    id: 'tch_nandeesh_admin',
    teacherId: 'NANDEESH_ADMIN',
    name: 'Nandeesh A S',
    email: 'nandeesh.as.2005@gmail.com',
    password: 'ADMINDHARMAASTRA',
    department: 'Computer Science and Engineering',
    createdAt: new Date().toISOString(),
    createdBy: 'System Root'
  },
  {
    id: 'tch_default_1',
    teacherId: 'TCH101',
    name: 'Prof. Alan Turing',
    email: 'turing@institution.edu',
    password: 'teacher123',
    department: 'Computer Science & AI',
    createdAt: new Date().toISOString(),
    createdBy: 'Main Admin'
  },
  {
    id: 'tch_default_2',
    teacherId: 'TCH102',
    name: 'Dr. Ada Lovelace',
    email: 'lovelace@institution.edu',
    password: 'teacher123',
    department: 'Mathematics & Computing',
    createdAt: new Date().toISOString(),
    createdBy: 'Main Admin'
  }
];

export interface Subject {
  id: string;
  name: string;
  code: string;
  description?: string;
  questions: Question[];
  durationMinutes?: number;
  examPassword?: string;
  isPublished?: boolean;
  updatedAt?: string;
  createdByTeacherId?: string;
  createdByTeacherName?: string;
}

export const QUESTIONS: Question[] = [
  { 
    id: 1, 
    text: "What is the primary purpose of the 'Exam Guardrail System'?", 
    type: 'mcq', 
    options: ["Game development", "Integrity monitoring & proctoring", "Social media streaming", "E-commerce platform"], 
    correctAnswer: 1, 
    points: 10 
  },
  { 
    id: 2, 
    text: "Which APIs or mechanisms are used to monitor academic integrity during the exam?", 
    type: 'multiple_select', 
    options: ["VisibilityChange API (Tab Switch)", "Browser Fullscreen API", "TensorFlow AI Face/Object Detection", "Bluetooth Battery API"], 
    correctAnswer: [0, 1, 2], 
    points: 15 
  },
  { 
    id: 3, 
    text: "True or False: Exiting fullscreen mode or switching tabs incurs a trust score penalty.", 
    type: 'true_false', 
    options: ["True", "False"], 
    correctAnswer: 0, 
    points: 10 
  },
  { 
    id: 4, 
    text: "Briefly describe why camera lighting and posture are important during an online proctored exam.", 
    type: 'short_answer', 
    correctAnswer: "Proper lighting and posture allow the AI vision model to continuously identify the student's face and prevent false face missing violations.", 
    points: 15 
  },
  { 
    id: 5, 
    text: "What is the default initial Trust Score assigned to a student at the start of an exam session?", 
    type: 'mcq', 
    options: ["50%", "75%", "100%", "0%"], 
    correctAnswer: 2, 
    points: 10 
  }
];

export const DEFAULT_SUBJECTS: Subject[] = [
  {
    id: 'sub_cs101',
    name: 'Computer Science & Proctoring AI',
    code: 'CS101',
    description: 'Proctoring algorithms, vision detection models, and web integrity APIs.',
    durationMinutes: 30,
    examPassword: 'CS101PASS',
    isPublished: true,
    questions: QUESTIONS
  },
  {
    id: 'sub_math201',
    name: 'Mathematics & Linear Algebra',
    code: 'MATH201',
    description: 'Calculus fundamentals, matrices, vectors, and probability logic.',
    durationMinutes: 45,
    examPassword: 'MATH201PASS',
    isPublished: false,
    questions: [
      {
        id: 'm1',
        text: 'What is the derivative of f(x) = x² + 3x + 5 with respect to x?',
        type: 'mcq',
        options: ['2x + 3', 'x + 3', '2x', '3x²'],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 'm2',
        text: 'Which of the following are prime numbers?',
        type: 'multiple_select',
        options: ['11', '15', '19', '21', '23'],
        correctAnswer: [0, 2, 4],
        points: 15
      },
      {
        id: 'm3',
        text: 'True or False: The determinant of an identity matrix is always 1.',
        type: 'true_false',
        options: ['True', 'False'],
        correctAnswer: 0,
        points: 10
      }
    ]
  },
  {
    id: 'sub_phys102',
    name: 'Physics & Quantum Dynamics',
    code: 'PHYS102',
    description: 'Kinematics, Newton laws, energy conservation, and wave properties.',
    durationMinutes: 40,
    examPassword: 'PHYS102PASS',
    isPublished: false,
    questions: [
      {
        id: 'p1',
        text: 'What is the SI unit of force?',
        type: 'mcq',
        options: ['Joule', 'Newton', 'Pascal', 'Watt'],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 'p2',
        text: 'State Newton\'s Second Law of Motion in equation form and explain key variables.',
        type: 'short_answer',
        correctAnswer: 'F = m * a (Force equals mass times acceleration).',
        points: 15
      }
    ]
  }
];
