require_relative 'boot'

require 'rails/all'

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :prod.
Bundler.require(*Rails.groups)

module Idseq
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 5.1
    config.time_zone = 'Pacific Time (US & Canada)'
    config.active_record.default_timezone = :local
    config.middleware.use Rack::Deflater
    config.encoding = "utf-8"

    # ActionMailer settings
    config.action_mailer.raise_delivery_errors = true
    config.action_mailer.perform_caching = false
    config.action_mailer.delivery_method = :smtp
    config.action_mailer.smtp_settings = {
      address: "email-smtp.us-west-2.amazonaws.com",
      authentication: :login,
      enable_starttls_auto: true,
      password: ENV["SMTP_PASSWORD"],
      port: 587,
      user_name: ENV["SMTP_USER"],
    }
  end
end
