import { Button } from '~/components/button';
import { DecoderText } from '~/components/decoder-text';
import { Divider } from '~/components/divider';
import { Footer } from '~/components/footer';
import { Heading } from '~/components/heading';
import { Icon } from '~/components/icon';
import { Input } from '~/components/input';
import { Section } from '~/components/section';
import { Text } from '~/components/text';
import { tokens } from '~/components/theme-provider/theme';
import { Transition } from '~/components/transition';
import { useFormInput } from '~/hooks';
import { useRef } from 'react';
import { cssProps, msToNum, numToMs } from '~/utils/style';
import { baseMeta } from '~/utils/meta';
import { Form, useActionData, useNavigation } from '@remix-run/react';
import { json } from '@remix-run/cloudflare';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import styles from './contact.module.css';

export const meta = () => {
  return baseMeta({
    title: 'Contact',
    description:
      'Send me a message if you’re interested in discussing a project or if you just want to say hi',
  });
};

const MAX_EMAIL_LENGTH = 512;
const MAX_MESSAGE_LENGTH = 4096;
const EMAIL_PATTERN = /(.+)@(.+){2,}\.(.+){2,}/;

export async function action({ context, request }) {
  console.log('=== Contact Form Debug ===');
  console.log('Environment variables check:');
  console.log('AWS_ACCESS_KEY_ID exists:', !!context.cloudflare.env.AWS_ACCESS_KEY_ID);
  console.log('AWS_SECRET_ACCESS_KEY exists:', !!context.cloudflare.env.AWS_SECRET_ACCESS_KEY);
  console.log('EMAIL exists:', !!context.cloudflare.env.EMAIL);
  console.log('FROM_EMAIL exists:', !!context.cloudflare.env.FROM_EMAIL);
  console.log('EMAIL value:', context.cloudflare.env.EMAIL);
  console.log('FROM_EMAIL value:', context.cloudflare.env.FROM_EMAIL);

  // Check if required environment variables exist
  if (!context.cloudflare.env.AWS_ACCESS_KEY_ID || 
      !context.cloudflare.env.AWS_SECRET_ACCESS_KEY || 
      !context.cloudflare.env.EMAIL || 
      !context.cloudflare.env.FROM_EMAIL) {
    console.error('Missing required environment variables');
    return json({ 
      errors: { 
        message: 'Server configuration error. Please contact the administrator.' 
      } 
    }, { status: 500 });
  }

  let ses;
  try {
    ses = new SESClient({
      region: 'us-west-2',
      credentials: {
        accessKeyId: context.cloudflare.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: context.cloudflare.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    console.log('SES Client created successfully');
  } catch (error) {
    console.error('Failed to create SES client:', error);
    return json({ 
      errors: { 
        message: 'Failed to initialize email service.' 
      } 
    }, { status: 500 });
  }

  const formData = await request.formData();
  const isBot = String(formData.get('name'));
  const email = String(formData.get('email')).trim();
  const message = String(formData.get('message')).trim();
  const errors = {};

  console.log('Form data received:');
  console.log('Bot check (should be empty):', isBot);
  console.log('Email:', email);
  console.log('Message length:', message.length);

  // Return without sending if a bot trips the honeypot
  if (isBot) {
    console.log('Bot detected, returning success without sending');
    return json({ success: true });
  }

  // Handle input validation on the server
  if (!email || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Please enter a valid email address.';
  }

  if (!message) {
    errors.message = 'Please enter a message.';
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    errors.email = `Email address must be shorter than ${MAX_EMAIL_LENGTH} characters.`;
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    errors.message = `Message must be shorter than ${MAX_MESSAGE_LENGTH} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    console.log('Validation errors:', errors);
    return json({ errors });
  }

  console.log('Preparing to send email...');
  
  const emailParams = {
    Destination: {
      ToAddresses: [context.cloudflare.env.EMAIL],
    },
    Message: {
      Body: {
        Text: {
          Data: `New contact form submission from your portfolio:

From: ${email}

Message:
${message}

---
This email was sent from your portfolio contact form.`,
        },
      },
      Subject: {
        Data: `Portfolio Contact: ${email}`,
      },
    },
    Source: context.cloudflare.env.FROM_EMAIL,
    ReplyToAddresses: [email],
  };

  console.log('Email parameters:', {
    to: emailParams.Destination.ToAddresses[0],
    from: emailParams.Source,
    subject: emailParams.Message.Subject.Data
  });

  try {
    console.log('Attempting to send email...');
    const result = await ses.send(new SendEmailCommand(emailParams));
    console.log('Email sent successfully:', result.MessageId);
    return json({ success: true });

  } catch (error) {
    console.error('=== SES ERROR DETAILS ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);

    // Check for specific SES errors
    let userMessage = 'Failed to send message. Please try again later.';
    
    if (error.name === 'MessageRejected') {
      console.error('SES rejected the message - check email verification');
      userMessage = 'Email service configuration issue. Please contact directly.';
    } else if (error.name === 'SendingPausedException') {
      console.error('SES sending is paused - account may be in sandbox');
      userMessage = 'Email service is temporarily unavailable.';
    } else if (error.code === 'InvalidParameterValue') {
      console.error('Invalid parameter - likely unverified email address');
      userMessage = 'Email configuration error. Please contact directly.';
    } else if (error.name === 'CredentialsProviderError') {
      console.error('AWS credentials error');
      userMessage = 'Authentication error. Please contact the administrator.';
    }
    
    return json({ 
      errors: { 
        message: userMessage 
      } 
    }, { status: 500 });
  }
}

export const Contact = () => {
  const errorRef = useRef();
  const email = useFormInput('');
  const message = useFormInput('');
  const initDelay = tokens.base.durationS;
  const actionData = useActionData();
  const { state } = useNavigation();
  const sending = state === 'submitting';

  return (
    <Section className={styles.contact}>
      <Transition unmount in={!actionData?.success} timeout={1600}>
        {({ status, nodeRef }) => (
          <Form
            unstable_viewTransition
            className={styles.form}
            method="post"
            ref={nodeRef}
          >
            <Heading
              className={styles.title}
              data-status={status}
              level={3}
              as="h1"
              style={getDelay(tokens.base.durationXS, initDelay, 0.3)}
            >
              <DecoderText text="Say hello" start={status !== 'exited'} delay={300} />
            </Heading>
            <Divider
              className={styles.divider}
              data-status={status}
              style={getDelay(tokens.base.durationXS, initDelay, 0.4)}
            />
            {/* Hidden honeypot field to identify bots */}
            <Input
              className={styles.botkiller}
              label="Name"
              name="name"
              maxLength={MAX_EMAIL_LENGTH}
            />
            <Input
              required
              className={styles.input}
              data-status={status}
              style={getDelay(tokens.base.durationXS, initDelay)}
              autoComplete="email"
              label="Your email"
              type="email"
              name="email"
              maxLength={MAX_EMAIL_LENGTH}
              {...email}
            />
            <Input
              required
              multiline
              className={styles.input}
              data-status={status}
              style={getDelay(tokens.base.durationS, initDelay)}
              autoComplete="off"
              label="Message"
              name="message"
              maxLength={MAX_MESSAGE_LENGTH}
              {...message}
            />
            <Transition
              unmount
              in={!sending && actionData?.errors}
              timeout={msToNum(tokens.base.durationM)}
            >
              {({ status: errorStatus, nodeRef }) => (
                <div
                  className={styles.formError}
                  ref={nodeRef}
                  data-status={errorStatus}
                  style={cssProps({
                    height: errorStatus ? errorRef.current?.offsetHeight : 0,
                  })}
                >
                  <div className={styles.formErrorContent} ref={errorRef}>
                    <div className={styles.formErrorMessage}>
                      <Icon className={styles.formErrorIcon} icon="error" />
                      {actionData?.errors?.email}
                      {actionData?.errors?.message}
                    </div>
                  </div>
                </div>
              )}
            </Transition>
            <Button
              className={styles.button}
              data-status={status}
              data-sending={sending}
              style={getDelay(tokens.base.durationM, initDelay)}
              disabled={sending}
              loading={sending}
              loadingText="Sending..."
              icon="send"
              type="submit"
            >
              Send message
            </Button>
          </Form>
        )}
      </Transition>
      <Transition unmount in={actionData?.success}>
        {({ status, nodeRef }) => (
          <div className={styles.complete} aria-live="polite" ref={nodeRef}>
            <Heading
              level={3}
              as="h3"
              className={styles.completeTitle}
              data-status={status}
            >
              Message Sent
            </Heading>
            <Text
              size="l"
              as="p"
              className={styles.completeText}
              data-status={status}
              style={getDelay(tokens.base.durationXS)}
            >
              I’ll get back to you within a couple days, sit tight
            </Text>
            <Button
              secondary
              iconHoverShift
              className={styles.completeButton}
              data-status={status}
              style={getDelay(tokens.base.durationM)}
              href="/"
              icon="chevron-right"
            >
              Back to homepage
            </Button>
          </div>
        )}
      </Transition>
      <Footer className={styles.footer} />
    </Section>
  );
};

function getDelay(delayMs, offset = numToMs(0), multiplier = 1) {
  const numDelay = msToNum(delayMs) * multiplier;
  return cssProps({ delay: numToMs((msToNum(offset) + numDelay).toFixed(0)) });
}
