# NanoFix Maintenance App

A PHP-based web application for managing vehicle maintenance services.

## Overview

MASKPRO Care App is a customer-facing web application that allows users to:

- Register and log in using mobile number and OTP verification
- Manage their vehicles (add, edit, delete)
- Schedule service appointments
- View service history
- Update profile information
- Track vehicle maintenance status

## Installation

### Requirements

- PHP 7.4 or higher
- MySQL 5.7 or higher
- Apache web server with mod_rewrite enabled

### Setup

1. Clone the repository to your web server's document root
2. Import the database schema from `docs/database-schema.md`
3. Configure the database connection in `db_connect.php`
4. Ensure the web server has write permissions to the application directory
5. Access the application through your web browser

## Directory Structure

```
maskprocare-app/
├── api.php                 # API endpoints for mobile app
├── assets/                 # Static assets
│   ├── css/                # CSS files
│   ├── img/                # Image files
│   └── js/                 # JavaScript files
├── booking_details.php     # Booking details page
├── bookings.php            # Bookings management page
├── config.php              # Application configuration
├── db_connect.php          # Database configuration
├── functions.php           # Common utility functions
├── includes/               # Reusable page components
│   ├── footer.php          # Page footer
│   └── header.php          # Page header with unified navigation
├── index.php               # Dashboard/home page
├── login.php               # Login page
├── logout.php              # Logout handler
├── profile.php             # User profile page
├── vehicle_details.php     # Vehicle details page
└── vehicles.php            # Vehicles management page
```

## Features

### Authentication

- Mobile number validation
- OTP generation and verification
- Session management

### Vehicle Management

- Add new vehicles
- Edit vehicle details
- Delete vehicles
- View vehicle service history
- Track vehicle service status

### Booking Management

- Schedule service appointments
- View upcoming appointments
- View past service history
- Cancel pending appointments

### User Profile

- Update personal information
- View account statistics

## API Endpoints

The application includes API endpoints for mobile app integration:

- `/api/mobile_validation` - Validate mobile number
- `/api/otp_service` - Generate and send OTP
- `/api/verify_otp` - Verify OTP and authenticate user
- `/api/customer` - Get customer data
- `/api/vehicles` - Get customer vehicles
- `/api/bookings` - Get customer bookings
- `/api/service_types` - Get available service types
- `/api/booking_slots` - Get available booking slots
- `/api/create_booking` - Create a new booking
- `/api/cancel_booking` - Cancel an existing booking
- `/api/add_vehicle` - Add a new vehicle
- `/api/update_vehicle` - Update vehicle details
- `/api/update_profile` - Update customer profile
- `/api/logout` - Log out user

## Development

### Local Development

1. Set up a local XAMPP environment
2. Clone the repository to `htdocs/unify.maskpro.ph/maskprocare-app/`
3. Import the database schema to your local MySQL server
4. Access the application at `http://localhost/unify.maskpro.ph/maskprocare-app/`

### Production Deployment

1. Upload the application files to the production server
2. Configure the database connection for production
3. Set appropriate file permissions
4. Access the application at `https://app.maskpro.ph/maskprocare-app/`

## License

This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

## Contact

For support or inquiries, please contact support@maskpro.ph.