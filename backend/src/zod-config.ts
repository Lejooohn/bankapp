// Zod 4 wording for default validation messages is replaced by the Zod 3 wording, so the
// frontend keeps showing the same messages. The configuration lives in @bankapp/shared and is
// applied here to the backend's own Zod instance.
//
// Must be imported before any schema is created.
import { z } from 'zod';
import { applyZod3Messages } from '@bankapp/shared';

applyZod3Messages(z);
