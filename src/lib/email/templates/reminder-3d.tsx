import {
  Html,
  Body,
  Container,
  Heading,
  Text,
  Button,
  Section,
} from "@react-email/components";

export function Reminder3dEmail(props: {
  memberName: string;
  planName: string;
  endDate: string;
  appUrl: string;
}) {
  return (
    <Html>
      <Body
        style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f6f6f6" }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            padding: "32px",
            maxWidth: "560px",
            margin: "0 auto",
          }}
        >
          <Heading style={{ fontSize: "20px", marginBottom: "16px" }}>
            Your membership ends in 3 days
          </Heading>
          <Text>Hi {props.memberName},</Text>
          <Text>
            Your <strong>{props.planName}</strong> membership ends on{" "}
            <strong>{props.endDate}</strong>. Renew at the front desk or pay
            online to keep training without interruption.
          </Text>
          <Section style={{ marginTop: "24px" }}>
            <Button
              href={`${props.appUrl}/portal`}
              style={{
                backgroundColor: "#000",
                color: "#fff",
                padding: "12px 20px",
                textDecoration: "none",
                borderRadius: "6px",
              }}
            >
              Open member portal
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
